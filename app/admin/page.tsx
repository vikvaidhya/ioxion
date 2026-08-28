import { getCurrentUser, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Gavel, Users, Shield, CheckCircle2, Circle } from "lucide-react";
import { SyncButton } from "./sync-button";

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);

  const supabase = await createClient();

  const { data: auction } = await supabase
    .from("auctions")
    .select("id, name, status, public_link_token")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, purse_remaining")
    .eq("auction_id", auction?.id ?? "");

  const { data: players } = await supabase
    .from("players")
    .select("id, full_name, cricclubs_id, cricclubs_id_status, dob")
    .eq("org_id", user.orgId)
    .order("full_name");

  // Latest CricClubs snapshot per player (for the "last synced" column).
  // Simple approach for MVP scale (≤30 players): fetch all snapshots for
  // this org's players, keep the newest per player_id in JS.
  const playerIds = players?.map((p) => p.id) ?? [];
  const { data: snapshots } = playerIds.length
    ? await supabase
        .from("cricclubs_snapshots")
        .select("player_id, synced_at, matches_played, batting_avg, batting_sr")
        .in("player_id", playerIds)
        .order("synced_at", { ascending: false })
    : { data: [] };

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

  return (
    <div className="min-h-screen bg-[#F6F4EF]">
      <div className="border-b border-[#DBD5C7] bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="text-[#1B4332]" size={20} />
            <span className="font-semibold">iOxion</span>
            <span className="text-[#8A8372] text-sm">/ Org Admin</span>
          </div>
          <div className="text-sm text-[#5C5646]">{user.orgName}</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {auction && (
          <div className="bg-white border border-[#DBD5C7] rounded-lg p-5 flex items-center justify-between">
            <div>
              <h1 className="font-semibold text-lg">{auction.name}</h1>
              <p className="text-sm text-[#8A8372] capitalize">Status: {auction.status}</p>
            </div>
            <a
              href={`/live/${auction.public_link_token}`}
              className="text-sm font-medium text-[#1B4332] hover:underline"
            >
              View public live link →
            </a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {teams?.map((t) => (
            <div key={t.id} className="bg-white border border-[#DBD5C7] rounded-lg p-4 flex items-center gap-3">
              <Shield className="text-[#1B4332]" size={18} />
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-[#8A8372] font-mono">
                  Purse: ₹{Number(t.purse_remaining).toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-[#DBD5C7] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEADD] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-[#8A8372]" />
              <h2 className="font-semibold text-sm">Player pool ({players?.length ?? 0})</h2>
            </div>
            <SyncButton />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#8A8372] border-b border-[#EFEADD]">
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-5 py-2.5 font-semibold">CricClubs ID</th>
                <th className="px-5 py-2.5 font-semibold">Verification</th>
                <th className="px-5 py-2.5 font-semibold">Matches</th>
                <th className="px-5 py-2.5 font-semibold">Bat Avg</th>
                <th className="px-5 py-2.5 font-semibold">Strike Rate</th>
                <th className="px-5 py-2.5 font-semibold">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {players?.map((p) => {
                const snap = latestSnapshotByPlayer.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-[#F6F4EF] last:border-0">
                    <td className="px-5 py-2.5">{p.full_name}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[#8A8372]">{p.cricclubs_id}</td>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs">
                        {p.cricclubs_id_status === "verified" ? (
                          <CheckCircle2 size={13} className="text-[#1B4332]" />
                        ) : (
                          <Circle size={13} className="text-[#B5AF9F]" />
                        )}
                        {p.cricclubs_id_status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[#5C5646]">
                      {snap?.matches_played ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[#5C5646]">
                      {snap?.batting_avg ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[#5C5646]">
                      {snap?.batting_sr ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-[#B5AF9F]">
                      {snap?.synced_at ? new Date(snap.synced_at).toLocaleTimeString() : "Never"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
