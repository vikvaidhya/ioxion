import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveExpiredLot } from "@/lib/auction/resolve-lot";

/**
 * Public, unauthenticated endpoint — read-only projection of the currently
 * open lot + bid summary for a given auction token. Deliberately excludes
 * anything sensitive (no user emails, no team-owner identities beyond team
 * name). Polled by the public live view every couple seconds rather than
 * using Realtime directly, so we never have to grant anonymous users RLS
 * access to the underlying tables.
 *
 * Also doubles as a resolution safety net: every poll checks whether the
 * currently open lot's timer has expired and, if so, resolves it right
 * here before building the response. This means as long as the public
 * live link is open anywhere (very likely during a real event — it's
 * usually left up on a shared screen), lots resolve within ~2 seconds
 * regardless of whether the Auctioneer's own tab is active or how often
 * the pg_cron backup job happens to run.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select("id, name, status")
    .eq("public_link_token", token)
    .maybeSingle();

  if (!auction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let { data: openLot } = await supabase
    .from("lots")
    .select("id, sequence_number, status, closes_at, auction_player_id")
    .eq("auction_id", auction.id)
    .eq("status", "open")
    .maybeSingle();

  if (openLot?.closes_at && new Date(openLot.closes_at) <= new Date()) {
    const result = await resolveExpiredLot(supabase, openLot.id);
    if (result.resolved) {
      // Lot just changed status — re-fetch so the response reflects the
      // resolution instead of showing a stale "open" state for one poll.
      openLot = null;
    }
  }

  let player = null;
  let highBid = null;
  let criciq: { primaryRole: string | null; battingScore: number | null; bowlingScore: number | null } | null = null;

  if (openLot) {
    const { data: ap } = await supabase
      .from("auction_players")
      .select("category, base_price, player_id, players(full_name)")
      .eq("id", openLot.auction_player_id)
      .single();

    if (ap) {
      player = {
        fullName: (ap.players as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
        category: ap.category,
        basePrice: ap.base_price,
      };

      const { data: criciqData } = await supabase
        .from("criciq_snapshots")
        .select("primary_role, batting_score, bowling_score")
        .eq("player_id", ap.player_id)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (criciqData) {
        criciq = {
          primaryRole: criciqData.primary_role,
          battingScore: criciqData.batting_score,
          bowlingScore: criciqData.bowling_score,
        };
      }
    }

    const { data: bid } = await supabase
      .from("bids")
      .select("amount, team_id, teams(name)")
      .eq("lot_id", openLot.id)
      .eq("is_voided", false)
      .order("amount", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bid) {
      highBid = {
        amount: bid.amount,
        teamName: (bid.teams as unknown as { name: string } | null)?.name ?? "Unknown team",
      };
    }
  }

  const { count: soldCount } = await supabase
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", auction.id)
    .eq("status", "sold");

  return NextResponse.json({
    auction: { name: auction.name, status: auction.status },
    openLot: openLot ? { sequenceNumber: openLot.sequence_number, closesAt: openLot.closes_at } : null,
    player,
    highBid,
    criciq,
    soldCount: soldCount ?? 0,
  });
}
