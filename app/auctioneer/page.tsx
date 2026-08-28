import { getCurrentUser, requireRole } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AuctioneerConsole } from "./console";

export default async function AuctioneerPage() {
  const user = await getCurrentUser();
  requireRole(user, ["auctioneer", "org_admin"]);

  const supabase = await createClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select("id, name, status, public_link_token")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!auction) {
    return <div className="p-8 text-center text-[#8A8372]">No auction found.</div>;
  }

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("*")
    .eq("auction_id", auction.id)
    .single();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, purse_remaining")
    .eq("auction_id", auction.id);

  // Ensure lots exist — lazily create one queued lot per pending auction_player,
  // ordered by category then base price. Idempotent: skip if lots already exist.
  // Uses the admin client because inserting into `lots` requires a write that
  // regular org members don't have via RLS — this whole page is already
  // gated by requireRole(["auctioneer","org_admin"]) above, so it's safe.
  const adminDb = createAdminClient();

  const { count: lotCount } = await supabase
    .from("lots")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", auction.id);

  if (!lotCount) {
    const { data: pendingPlayers } = await supabase
      .from("auction_players")
      .select("id")
      .eq("auction_id", auction.id)
      .eq("status", "pending")
      .order("category")
      .order("base_price", { ascending: false });

    if (pendingPlayers && pendingPlayers.length > 0) {
      const rows = pendingPlayers.map((p, i) => ({
        auction_id: auction.id,
        auction_player_id: p.id,
        sequence_number: i + 1,
        status: "queued" as const,
      }));
      // upsert + ignoreDuplicates: if two requests race to create the lot
      // queue at the same time (e.g. multiple people opening /auctioneer
      // simultaneously), duplicate rows are silently skipped instead of
      // throwing a unique-constraint error.
      const { error: lotInsertError } = await adminDb
        .from("lots")
        .upsert(rows, { onConflict: "auction_id,sequence_number", ignoreDuplicates: true });
      if (lotInsertError) {
        console.error(`Failed to create initial lots: ${lotInsertError.message} (code: ${lotInsertError.code})`);
      }
    }
  }

  const { data: lots } = await supabase
    .from("lots")
    .select("id, sequence_number, status, auction_player_id, closes_at")
    .eq("auction_id", auction.id)
    .order("sequence_number");

  return (
    <AuctioneerConsole
      auction={auction}
      ruleset={ruleset}
      teams={teams ?? []}
      initialLots={lots ?? []}
      orgName={user.orgName}
    />
  );
}
