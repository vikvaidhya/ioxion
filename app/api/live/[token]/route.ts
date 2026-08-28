import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Public, unauthenticated endpoint — read-only projection of the currently
 * open lot + bid summary for a given auction token. Deliberately excludes
 * anything sensitive (no user emails, no team-owner identities beyond team
 * name). Polled by the public live view every couple seconds rather than
 * using Realtime directly, so we never have to grant anonymous users RLS
 * access to the underlying tables.
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

  const { data: openLot } = await supabase
    .from("lots")
    .select("id, sequence_number, status, closes_at, auction_player_id")
    .eq("auction_id", auction.id)
    .eq("status", "open")
    .maybeSingle();

  let player = null;
  let highBid = null;

  if (openLot) {
    const { data: ap } = await supabase
      .from("auction_players")
      .select("category, base_price, players(full_name)")
      .eq("id", openLot.auction_player_id)
      .single();

    if (ap) {
      player = {
        fullName: (ap.players as unknown as { full_name: string } | null)?.full_name ?? "Unknown",
        category: ap.category,
        basePrice: ap.base_price,
      };
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
    soldCount: soldCount ?? 0,
  });
}
