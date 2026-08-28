import { createAdminClient } from "@/lib/supabase/server";
import { PublicLiveView } from "./public-live-view";
import { notFound } from "next/navigation";

/**
 * Public route — deliberately does NOT use the RLS-scoped server client.
 * Anonymous visitors have no auth session, so we resolve access purely via
 * the opaque public_link_token using the admin client, and hand the client
 * component only a read-only projection (no write actions are exposed here).
 */
export default async function PublicLivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select("id, name, status")
    .eq("public_link_token", token)
    .maybeSingle();

  if (!auction) notFound();

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("currency_symbol, currency_name, currency_type")
    .eq("auction_id", auction.id)
    .single();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, purse_remaining")
    .eq("auction_id", auction.id);

  return <PublicLiveView auction={auction} ruleset={ruleset} teams={teams ?? []} />;
}
