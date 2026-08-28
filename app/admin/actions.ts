"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { fetchCricClubsStats } from "@/lib/integrations/cricclubs";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

/**
 * Manually triggered by an Org Admin — pulls latest stats for every player
 * in the org who has a CricClubs ID, and writes a new snapshot row per
 * player. Snapshots are append-only: we never overwrite, so full sync
 * history is preserved and the UI can always show "as of" freshness.
 */
export async function syncCricClubsAction() {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);

  const supabase = await createClient();
  // Writes below use the admin client: this action is already role-gated by
  // requireRole() above, and cricclubs_snapshots/audit_log intentionally have
  // no RLS insert policy for regular users (only server-triggered writes are
  // allowed here) — so we use service_role for the actual insert.
  const adminDb = createAdminClient();

  const { data: players, error } = await supabase
    .from("players")
    .select("id, cricclubs_id")
    .eq("org_id", user.orgId)
    .not("cricclubs_id", "is", null);

  if (error) throw error;

  let syncedCount = 0;
  let failedCount = 0;

  for (const player of players ?? []) {
    if (!player.cricclubs_id) continue;

    try {
      const stats = await fetchCricClubsStats(player.cricclubs_id);

      const { error: insertErr } = await adminDb.from("cricclubs_snapshots").insert({
        player_id: player.id,
        synced_by: user.userId,
        raw_payload: stats.raw,
        matches_played: stats.matchesPlayed,
        batting_avg: stats.battingAvg,
        batting_sr: stats.battingSr,
        bowling_avg: stats.bowlingAvg,
        bowling_econ: stats.bowlingEcon,
        profile_data: stats.profile,
      });
      if (insertErr) {
        console.error(`CricClubs snapshot insert failed for player ${player.id}:`, insertErr);
        Sentry.captureException(new Error(`CricClubs snapshot insert failed: ${insertErr.message}`), {
          tags: { area: "cricclubs_sync" },
          extra: { playerId: player.id, orgId: user.orgId },
        });
        failedCount++;
      } else {
        syncedCount++;
      }
    } catch (err) {
      // Don't let one player's sync failure block the rest of the batch.
      console.error(`CricClubs sync failed for player ${player.id}:`, err);
      Sentry.captureException(err, {
        tags: { area: "cricclubs_sync" },
        extra: { playerId: player.id, orgId: user.orgId },
      });
      failedCount++;
    }
  }

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    actor_user_id: user.userId,
    action: "cricclubs.sync_triggered",
    metadata: { player_count: players?.length ?? 0, synced: syncedCount, failed: failedCount },
  });

  revalidatePath("/admin");
  return { synced: syncedCount, failed: failedCount, total: players?.length ?? 0 };
}
