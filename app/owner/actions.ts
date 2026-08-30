"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { isValidBid, nextValidBid, type Category } from "@/lib/auction/rules";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

export async function placeBidAction(lotId: string, teamId: string, amount: number) {
  const user = await getCurrentUser();
  requireRole(user, ["owner"]);
  const supabase = await createClient();
  // Ownership is explicitly verified below before any write, so using the
  // admin client for the lock/insert/extend steps is safe — it's needed
  // because the `lots` table has no RLS update policy for regular users
  // (only the role-gated server actions in this app are allowed to mutate
  // lot state).
  const adminDb = createAdminClient();

  // Confirm this user actually owns this team
  const { data: ownership } = await supabase
    .from("team_owners")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", user.userId)
    .maybeSingle();
  if (!ownership) return { error: "You do not own this team." };

  const { data: lot } = await supabase
    .from("lots")
    .select("id, status, closes_at, auction_id, auction_player_id, version")
    .eq("id", lotId)
    .single();
  if (!lot || lot.status !== "open") return { error: "This lot is not open for bidding." };
  if (lot.closes_at && new Date(lot.closes_at) <= new Date()) {
    return { error: "Bidding has closed for this lot." };
  }

  const { data: auctionPlayer } = await supabase
    .from("auction_players")
    .select("category, base_price, player_id")
    .eq("id", lot.auction_player_id)
    .single();
  if (!auctionPlayer) return { error: "Player not found." };

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("categories, purse_per_team, min_squad_size, max_squad_size, max_overseas_per_team")
    .eq("auction_id", lot.auction_id)
    .single();
  if (!ruleset) return { error: "Ruleset not found." };

  const category = (ruleset.categories as unknown as Category[]).find(
    (c) => c.name === auctionPlayer.category
  );
  if (!category) return { error: "Category not configured." };

  const { data: highBid } = await supabase
    .from("bids")
    .select("amount")
    .eq("lot_id", lotId)
    .eq("is_voided", false)
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: team } = await supabase.from("teams").select("purse_remaining").eq("id", teamId).single();
  if (!team) return { error: "Team not found." };

  const { count: squadCount } = await supabase
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", lot.auction_id)
    .eq("sold_to_team_id", teamId);

  const { data: cheapestRemaining } = await supabase
    .from("auction_players")
    .select("base_price")
    .eq("auction_id", lot.auction_id)
    .eq("status", "pending")
    .order("base_price", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Overseas cap check — only bother fetching this data if a cap is
  // actually configured, since it's an extra couple queries otherwise
  // unneeded for most auctions.
  let isPlayerOverseas = false;
  let currentOverseasCount = 0;
  if (ruleset.max_overseas_per_team !== null) {
    const { data: playerRow } = await supabase.from("players").select("is_overseas").eq("id", auctionPlayer.player_id).single();
    isPlayerOverseas = playerRow?.is_overseas ?? false;

    if (isPlayerOverseas) {
      const { data: soldRows } = await supabase
        .from("auction_players")
        .select("player_id")
        .eq("auction_id", lot.auction_id)
        .eq("sold_to_team_id", teamId)
        .eq("status", "sold");
      const soldPlayerIds = (soldRows ?? []).map((r) => r.player_id);
      if (soldPlayerIds.length) {
        const { count } = await supabase
          .from("players")
          .select("id", { count: "exact", head: true })
          .in("id", soldPlayerIds)
          .eq("is_overseas", true);
        currentOverseasCount = count ?? 0;
      }
    }
  }

  const validation = isValidBid({
    amount,
    currentHighBid: highBid?.amount ?? null,
    basePrice: auctionPlayer.base_price,
    category,
    purseRemaining: team.purse_remaining,
    currentSquadSize: squadCount ?? 0,
    minSquadSize: ruleset.min_squad_size,
    maxSquadSize: ruleset.max_squad_size,
    cheapestRemainingBasePrice: cheapestRemaining?.base_price ?? auctionPlayer.base_price,
    isPlayerOverseas,
    currentOverseasCount,
    maxOverseasPerTeam: ruleset.max_overseas_per_team,
  });

  if (!validation.valid) return { error: validation.reason };

  // Optimistic-lock the lot on `version` so two near-simultaneous bids
  // can't both believe they were the winning insert — whoever updates the
  // version first wins; the loser gets an error and should refetch/retry.
  const { data: lockedLot, error: lockError } = await adminDb
    .from("lots")
    .update({ version: lot.version + 1 })
    .eq("id", lotId)
    .eq("version", lot.version)
    .select()
    .single();

  if (lockError || !lockedLot) {
    return { error: "Someone else just bid — please retry." };
  }

  const { data: bid, error: bidError } = await adminDb
    .from("bids")
    .insert({ lot_id: lotId, team_id: teamId, amount, placed_by: user.userId })
    .select()
    .single();

  if (bidError) {
    Sentry.captureException(new Error(`Bid insert failed: ${bidError.message}`), {
      tags: { area: "place_bid" },
      extra: { lotId, teamId, amount },
    });
    return { error: bidError.message };
  }

  // Soft-close: extend the deadline so the lot never expires mid-flurry.
  const { data: ruleset2 } = await supabase
    .from("auction_rulesets")
    .select("soft_close_seconds")
    .eq("auction_id", lot.auction_id)
    .single();

  const newClosesAt = new Date(Date.now() + (ruleset2?.soft_close_seconds ?? 10) * 1000);
  await adminDb
    .from("lots")
    .update({ closes_at: newClosesAt.toISOString(), current_high_bid_id: bid.id })
    .eq("id", lotId);

  revalidatePath("/owner");
  return { success: true, bid };
}
