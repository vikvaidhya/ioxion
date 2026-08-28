"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

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
    .select("id, auction_id, auction_player_id, status, closes_at")
    .eq("id", lotId)
    .single();

  if (!lot || lot.status !== "open") return { error: "Lot is not open." };
  if (lot.closes_at && new Date(lot.closes_at) > new Date()) {
    return { error: "Timer hasn't expired yet." };
  }

  const { data: highBid } = await supabase
    .from("bids")
    .select("id, team_id, amount")
    .eq("lot_id", lotId)
    .eq("is_voided", false)
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!highBid) {
    // Unsold
    const { error: lotErr } = await adminDb.from("lots").update({ status: "unsold", closed_at: new Date().toISOString() }).eq("id", lotId);
    const { error: playerErr } = await adminDb
      .from("auction_players")
      .update({ status: "unsold" })
      .eq("id", lot.auction_player_id);

    if (lotErr || playerErr) {
      Sentry.captureException(new Error("Failed to mark lot unsold"), {
        tags: { area: "lot_resolution" },
        extra: { lotId, lotErr, playerErr },
      });
    }
  } else {
    // Sold — update lot, auction_player, and deduct from team purse
    const { error: lotErr } = await adminDb
      .from("lots")
      .update({ status: "sold", closed_at: new Date().toISOString(), current_high_bid_id: highBid.id })
      .eq("id", lotId);
    const { error: playerErr } = await adminDb
      .from("auction_players")
      .update({ status: "sold", sold_to_team_id: highBid.team_id, sold_price: highBid.amount })
      .eq("id", lot.auction_player_id);

    const { data: team } = await supabase.from("teams").select("purse_remaining").eq("id", highBid.team_id).single();
    let purseErr = null;
    if (team) {
      const res = await adminDb
        .from("teams")
        .update({ purse_remaining: team.purse_remaining - highBid.amount })
        .eq("id", highBid.team_id);
      purseErr = res.error;
    }

    // This block moves real money (purse deduction) — any failure here is
    // high-severity: it could mean a team's purse and their actual squad
    // no longer agree, which corrupts the auction's core invariant.
    if (lotErr || playerErr || purseErr || !team) {
      Sentry.captureException(new Error("Failed to complete lot sale — purse/squad state may be inconsistent"), {
        level: "error",
        tags: { area: "lot_resolution", critical: "true" },
        extra: { lotId, teamId: highBid.team_id, amount: highBid.amount, lotErr, playerErr, purseErr, teamFound: !!team },
      });
    }
  }

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
