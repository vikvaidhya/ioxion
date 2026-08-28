import { getCurrentUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OwnerBiddingRoom } from "./bidding-room";

export default async function OwnerPage() {
  const user = await getCurrentUser();
  requireRole(user, ["owner"]);

  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, purse_remaining, auction_id")
    .in(
      "id",
      (
        await supabase.from("team_owners").select("team_id").eq("user_id", user.userId)
      ).data?.map((r) => r.team_id) ?? []
    )
    .limit(1)
    .single();

  if (!team) {
    return <div className="p-8 text-center text-[#8A8372]">No team assigned to your account yet.</div>;
  }

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("*")
    .eq("auction_id", team.auction_id)
    .single();

  const { count: squadCount } = await supabase
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", team.auction_id)
    .eq("sold_to_team_id", team.id);

  return (
    <OwnerBiddingRoom
      team={team}
      ruleset={ruleset}
      squadCount={squadCount ?? 0}
      userId={user.userId}
      orgName={user.orgName}
    />
  );
}
