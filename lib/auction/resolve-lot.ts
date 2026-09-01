import * as Sentry from "@sentry/nextjs";

/**
 * Resolves an expired open lot to sold/unsold. Deterministic and safe to
 * call multiple times or from multiple places concurrently — it only
 * acts on a lot that is genuinely still 'open' with an expired timer, so
 * a race between two callers (e.g. the Auctioneer's auto-trigger and a
 * public viewer's poll both noticing the same expired lot) just means
 * the second call finds status already changed and no-ops harmlessly.
 *
 * This is intentionally callable WITHOUT an org_admin/auctioneer role
 * check — unlike a manual "mark sold" click, this only ever fires
 * automatically when the server-side clock confirms the timer has
 * actually expired, so there's no privileged decision being made here
 * that a regular viewer's browser could abuse. It exists specifically so
 * resolution doesn't depend entirely on cron timing or the Auctioneer's
 * tab being open — any client polling the public live view also nudges
 * expired lots along.
 */
export async function resolveExpiredLot(adminDb: any, lotId: string): Promise<{ resolved: boolean; error?: string }> {
  const { data: lot } = await adminDb
    .from("lots")
    .select("id, auction_id, auction_player_id, status, closes_at")
    .eq("id", lotId)
    .single();

  if (!lot || lot.status !== "open") return { resolved: false };
  if (!lot.closes_at || new Date(lot.closes_at) > new Date()) return { resolved: false };

  const { data: highBid } = await adminDb
    .from("bids")
    .select("id, team_id, amount")
    .eq("lot_id", lotId)
    .eq("is_voided", false)
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!highBid) {
    const { error: lotErr } = await adminDb
      .from("lots")
      .update({ status: "unsold", closed_at: new Date().toISOString() })
      .eq("id", lotId)
      .eq("status", "open"); // guard against a concurrent resolver winning the race
    const { error: playerErr } = await adminDb
      .from("auction_players")
      .update({ status: "unsold" })
      .eq("id", lot.auction_player_id);

    if (lotErr || playerErr) {
      Sentry.captureException(new Error("Failed to mark lot unsold"), {
        tags: { area: "lot_resolution" },
        extra: { lotId, lotErr, playerErr },
      });
      return { resolved: false, error: "Failed to mark unsold." };
    }
    return { resolved: true };
  }

  const { error: lotErr } = await adminDb
    .from("lots")
    .update({ status: "sold", closed_at: new Date().toISOString(), current_high_bid_id: highBid.id })
    .eq("id", lotId)
    .eq("status", "open");
  const { error: playerErr } = await adminDb
    .from("auction_players")
    .update({ status: "sold", sold_to_team_id: highBid.team_id, sold_price: highBid.amount })
    .eq("id", lot.auction_player_id);

  const { data: team } = await adminDb.from("teams").select("purse_remaining").eq("id", highBid.team_id).single();
  let purseErr = null;
  if (team) {
    const res = await adminDb
      .from("teams")
      .update({ purse_remaining: team.purse_remaining - highBid.amount })
      .eq("id", highBid.team_id);
    purseErr = res.error;
  }

  if (lotErr || playerErr || purseErr || !team) {
    Sentry.captureException(new Error("Failed to complete lot sale — purse/squad state may be inconsistent"), {
      level: "error",
      tags: { area: "lot_resolution", critical: "true" },
      extra: { lotId, teamId: highBid.team_id, amount: highBid.amount, lotErr, playerErr, purseErr, teamFound: !!team },
    });
    return { resolved: false, error: "Failed to complete sale." };
  }

  return { resolved: true };
}
