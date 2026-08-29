import { getCurrentUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Gavel, Users, Shield } from "lucide-react";
import { SyncButton } from "./sync-button";
import { CreateAuctionForm } from "./create-auction-form";
import { AddTeamForm } from "./add-team-form";
import { InvitePersonForm } from "./invite-person-form";
import { AddPlayerForm } from "./add-player-form";
import { BulkUploadPlayersForm } from "./bulk-upload-players-form";
import { CricIQUploadForm } from "./criciq-upload-form";
import { PlayerTable } from "./player-table";
import { RulesEditor } from "./rules-editor";
import { TeamCard } from "./team-card";
import { AppearanceSettings } from "./appearance-settings";

interface Category {
  name: string;
  basePrice: number;
}

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);

  const supabase = await createClient();

  const { data: orgRow } = await supabase.from("orgs").select("theme_color").eq("id", user.orgId).maybeSingle();
  const orgThemeColor = orgRow?.theme_color ?? null;

  const { data: auction } = await supabase
    .from("auctions")
    .select("id, name, status, public_link_token")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No auction yet — this org was just bootstrapped. Show setup instead
  // of a broken/empty dashboard.
  if (!auction) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex flex-col">
        <div className="border-b border-[var(--line)] bg-white">
          <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gavel className="text-[var(--brand)]" size={20} />
              <span className="font-semibold">iOxion</span>
              <span className="text-[var(--ink-soft)] text-sm">/ Org Admin</span>
            </div>
            <div className="text-sm text-[var(--ink-soft)]">{user.orgName}</div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <CreateAuctionForm />
        </div>
      </div>
    );
  }

  const { data: ruleset } = await supabase
    .from("auction_rulesets")
    .select("*")
    .eq("auction_id", auction.id)
    .maybeSingle();

  const categories: Category[] = (ruleset?.categories as Category[]) ?? [];

  const { count: soldCount } = await supabase
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", auction.id)
    .eq("status", "sold");

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, purse_remaining")
    .eq("auction_id", auction.id);

  const { data: owners } = teams && teams.length > 0
    ? await supabase
        .from("team_owners")
        .select("team_id, users(email, full_name)")
        .in("team_id", teams.map((t) => t.id))
    : { data: [] };

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, cricclubs_id, cricclubs_id_status, dob, role_override")
    .eq("org_id", user.orgId)
    .order("full_name");

  const playerIds = players?.map((p) => p.id) ?? [];
  const { data: snapshots } = playerIds.length
    ? await supabase
        .from("cricclubs_snapshots")
        .select("player_id, synced_at, matches_played, batting_avg, batting_sr")
        .in("player_id", playerIds)
        .order("synced_at", { ascending: false })
    : { data: [] };

  const { data: auctionPlayers } = playerIds.length
    ? await supabase
        .from("auction_players")
        .select("player_id, status, category, base_price")
        .eq("auction_id", auction.id)
        .in("player_id", playerIds)
    : { data: [] };

  interface AuctionPlayerInfo {
    player_id: string;
    status: string;
    category: string;
    base_price: number;
  }

  const auctionPlayerByPlayer = new Map<string, AuctionPlayerInfo>();
  for (const ap of (auctionPlayers ?? []) as AuctionPlayerInfo[]) {
    auctionPlayerByPlayer.set(ap.player_id, ap);
  }

  interface Snapshot {
    player_id: string;
    synced_at: string;
    matches_played: number | null;
    batting_avg: number | null;
    batting_sr: number | null;
  }

  const latestSnapshotByPlayer = new Map<string, Snapshot>();
  for (const s of (snapshots ?? []) as Snapshot[]) {
    if (!latestSnapshotByPlayer.has(s.player_id)) {
      latestSnapshotByPlayer.set(s.player_id, s);
    }
  }

  const { data: criciqSnapshots } = playerIds.length
    ? await supabase
        .from("criciq_snapshots")
        .select(
          "player_id, synced_at, summary_text, runs, innings, not_outs, batting_avg, strike_rate, highest_score, fifties, hundreds, fours, sixes, ducks, boundary_pct, wickets, overs, maidens, economy, bowling_avg, bowling_sr, primary_role, persona, role_basis, batting_score, bowling_score, performance_score"
        )
        .in("player_id", playerIds)
        .order("synced_at", { ascending: false })
    : { data: [] };

  interface CricIQSnapshot {
    player_id: string;
    synced_at: string;
    summary_text: string | null;
    runs: number | null;
    innings: number | null;
    not_outs: number | null;
    batting_avg: number | null;
    strike_rate: number | null;
    highest_score: number | null;
    fifties: number | null;
    hundreds: number | null;
    fours: number | null;
    sixes: number | null;
    ducks: number | null;
    boundary_pct: number | null;
    wickets: number | null;
    overs: number | null;
    maidens: number | null;
    economy: number | null;
    bowling_avg: number | null;
    bowling_sr: number | null;
    primary_role: string | null;
    persona: string | null;
    role_basis: string | null;
    batting_score: number | null;
    bowling_score: number | null;
    performance_score: number | null;
  }

  const latestCricIQByPlayer = new Map<string, CricIQSnapshot>();
  for (const s of (criciqSnapshots ?? []) as CricIQSnapshot[]) {
    if (!latestCricIQByPlayer.has(s.player_id)) {
      latestCricIQByPlayer.set(s.player_id, s);
    }
  }

  const ownersByTeam = new Map<string, { email: string; full_name: string | null }[]>();
  for (const o of owners ?? []) {
    const list = ownersByTeam.get(o.team_id) ?? [];
    if (o.users) list.push(o.users as unknown as { email: string; full_name: string | null });
    ownersByTeam.set(o.team_id, list);
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="border-b border-[var(--line)] bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="text-[var(--brand)]" size={20} />
            <span className="font-semibold">iOxion</span>
            <span className="text-[var(--ink-soft)] text-sm">/ Org Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <AppearanceSettings currentColor={orgThemeColor ?? "#1B6B4A"} />
            <div className="text-sm text-[var(--ink-soft)]">{user.orgName}</div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="bg-white border border-[var(--line)] rounded-lg p-5 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">{auction.name}</h1>
            <p className="text-sm text-[var(--ink-soft)] capitalize">Status: {auction.status}</p>
          </div>
          <div className="flex items-center gap-4">
            {ruleset && (
              <RulesEditor
                key={ruleset.updated_at}
                auctionId={auction.id}
                initialRuleset={ruleset}
                hasAnySoldPlayers={(soldCount ?? 0) > 0}
              />
            )}
            <a
              href={`/live/${auction.public_link_token}`}
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              View public live link →
            </a>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Shield size={16} className="text-[var(--ink-soft)]" /> Teams ({teams?.length ?? 0})
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {teams?.map((t) => (
              <TeamCard
                key={t.id}
                team={t}
                currencySymbol={ruleset?.currency_symbol ?? "₹"}
                owners={ownersByTeam.get(t.id) ?? []}
                auctionId={auction.id}
              />
            ))}
            <AddTeamForm auctionId={auction.id} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InvitePersonForm mode="owner" teams={teams ?? []} />
          <InvitePersonForm mode="auctioneer" />
        </div>

        <div className="bg-white border border-[var(--line)] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--brand-soft)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[var(--ink-soft)]" />
              <h2 className="font-semibold text-sm">Player pool ({players?.length ?? 0})</h2>
            </div>
            <div className="flex items-center gap-2">
              <BulkUploadPlayersForm auctionId={auction.id} categories={categories} />
              <CricIQUploadForm />
              <SyncButton />
            </div>
          </div>
          <div className="px-5 pt-4">
            <AddPlayerForm auctionId={auction.id} categories={categories} currencySymbol={ruleset?.currency_symbol ?? "₹"} />
          </div>
          <PlayerTable
            players={players ?? []}
            snapshotByPlayer={latestSnapshotByPlayer}
            criciqByPlayer={latestCricIQByPlayer}
            auctionPlayerByPlayer={auctionPlayerByPlayer}
            auctionId={auction.id}
            categories={categories}
          />
        </div>
      </div>
    </div>
  );
}
