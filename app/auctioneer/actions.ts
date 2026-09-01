"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { resolveExpiredLot } from "@/lib/auction/resolve-lot";

/**
 * NOTE on admin client usage: every exported function here is gated by
 * requireRole() as the FIRST line, so the security boundary is enforced in
 * application code before any database call happens. Writes then use the
 * admin (service_role) client because lots/bids/auction_players/teams/
 * audit_log intentionally have no broad RLS write policy for regular users
 * — only these specific, role-checked server actions are allowed to mutate
 * them. Reads use the regular RLS-scoped client where convenient.
 */

/**
 * Opens the next queued lot: sets status='open', starts the soft-close
 * timer. Only one lot should be open at a time per auction — enforced by
 * checking no other lot is currently 'open' before opening a new one.
 */
export async function openNextLotAction(auctionId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);
  const supabase = await createClient();
  const adminDb = createAdminClient();

  const { data: auction } = await supabase.from("auctions").select("status").eq("id", auctionId).single();
  if (auction?.status === "paused") {
    return { error: "Auction is paused — resume it before opening a lot." };
  }

  const { data: alreadyOpen } = await supabase
    .from("lots")
    .select("id")
    .eq("auction_id", auctionId)
    .eq("status", "open")
    .maybeSingle();

  if (alreadyOpen) {
    return { error: "A lot is already open. Close it before opening the next." };
  }

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("soft_close_seconds")
    .eq("auction_id", auctionId)
    .single();

  const { data: nextLot } = await supabase
    .from("lots")
    .select("id, sequence_number, auction_player_id")
    .eq("auction_id", auctionId)
    .eq("status", "queued")
    .order("sequence_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextLot) {
    return { error: "No more queued lots." };
  }

  // First lot of the auction — flip the auction from draft/configured to
  // live. Nothing did this before, which meant e.g. the retention lock
  // ("can't change retentions once live") never actually engaged.
  if (auction && ["draft", "configured"].includes(auction.status)) {
    await adminDb.from("auctions").update({ status: "live" }).eq("id", auctionId);
  }

  const closesAt = new Date(Date.now() + (ruleset?.soft_close_seconds ?? 10) * 1000);

  const { error } = await adminDb
    .from("lots")
    .update({ status: "open", opened_at: new Date().toISOString(), closes_at: closesAt.toISOString() })
    .eq("id", nextLot.id);

  if (error) return { error: error.message };

  const { error: playerErr } = await adminDb
    .from("auction_players")
    .update({ status: "in_lot" })
    .eq("id", nextLot.auction_player_id);

  if (playerErr) return { error: playerErr.message };

  revalidatePath("/auctioneer");
  return { success: true };
}

/**
 * Resolves an open lot whose timer has expired: sold (to the current high
 * bidder) or unsold (no bids at all). This is the ONLY place team purses
 * and squad state actually change, kept in one sequence so purse/squad and
 * lot/player status can't drift apart.
 */
export async function resolveLotAction(lotId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);
  const supabase = await createClient();
  const adminDb = createAdminClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("id, auction_id, status, closes_at")
    .eq("id", lotId)
    .single();

  if (!lot || lot.status !== "open") return { error: "Lot is not open." };
  if (lot.closes_at && new Date(lot.closes_at) > new Date()) {
    return { error: "Timer hasn't expired yet." };
  }

  const { data: highBid } = await supabase
    .from("bids")
    .select("team_id, amount")
    .eq("lot_id", lotId)
    .eq("is_voided", false)
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  const result = await resolveExpiredLot(adminDb, lotId);
  if (!result.resolved) return { error: result.error ?? "Could not resolve — it may already be resolved." };

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    auction_id: lot.auction_id,
    actor_user_id: user.userId,
    action: highBid ? "lot.sold" : "lot.unsold",
    entity_type: "lot",
    entity_id: lotId,
    metadata: highBid ? { team_id: highBid.team_id, amount: highBid.amount } : {},
  });

  revalidatePath("/auctioneer");
  return { success: true };
}

/** Auctioneer override: void an erroneous bid without deleting it (audit trail preserved). */
export async function voidBidAction(bidId: string, reason: string) {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);
  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("bids")
    .update({ is_voided: true, voided_reason: reason })
    .eq("id", bidId);

  if (error) return { error: error.message };

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    actor_user_id: user.userId,
    action: "bid.voided",
    entity_type: "bid",
    entity_id: bidId,
    metadata: { reason },
  });

  revalidatePath("/auctioneer");
  return { success: true };
}

/**
 * Pauses the auction. If a lot is currently open, its remaining countdown
 * time is captured and closes_at is cleared — this isn't just cosmetic:
 * with closes_at null, the pg_cron safety-net job (which only resolves
 * lots where closes_at < now()) can never auto-resolve it while paused,
 * and the countdown display naturally shows "paused" instead of
 * misleadingly ticking toward zero.
 */
export async function pauseAuctionAction(auctionId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);
  const adminDb = createAdminClient();

  const { data: openLot } = await adminDb
    .from("lots")
    .select("id, closes_at")
    .eq("auction_id", auctionId)
    .eq("status", "open")
    .maybeSingle();

  if (openLot && openLot.closes_at) {
    const remaining = Math.max(0, Math.round((new Date(openLot.closes_at).getTime() - Date.now()) / 1000));
    await adminDb
      .from("lots")
      .update({ closes_at: null, frozen_seconds_remaining: remaining })
      .eq("id", openLot.id);
  }

  const { error } = await adminDb.from("auctions").update({ status: "paused" }).eq("id", auctionId);
  if (error) return { error: error.message };

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    auction_id: auctionId,
    actor_user_id: user.userId,
    action: "auction.paused",
  });

  revalidatePath("/auctioneer");
  revalidatePath("/owner");
  return { success: true };
}

/** Resumes a paused auction — restores the open lot's timer from where it was frozen, not a fresh full duration. */
export async function resumeAuctionAction(auctionId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);
  const adminDb = createAdminClient();

  const { data: frozenLot } = await adminDb
    .from("lots")
    .select("id, frozen_seconds_remaining")
    .eq("auction_id", auctionId)
    .eq("status", "open")
    .not("frozen_seconds_remaining", "is", null)
    .maybeSingle();

  if (frozenLot) {
    const newClosesAt = new Date(Date.now() + (frozenLot.frozen_seconds_remaining ?? 10) * 1000);
    await adminDb
      .from("lots")
      .update({ closes_at: newClosesAt.toISOString(), frozen_seconds_remaining: null })
      .eq("id", frozenLot.id);
  }

  const { error } = await adminDb.from("auctions").update({ status: "live" }).eq("id", auctionId);
  if (error) return { error: error.message };

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    auction_id: auctionId,
    actor_user_id: user.userId,
    action: "auction.resumed",
  });

  revalidatePath("/auctioneer");
  revalidatePath("/owner");
  return { success: true };
}
