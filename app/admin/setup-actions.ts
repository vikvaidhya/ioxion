"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

/**
 * Creates the auction shell for this org if one doesn't already exist.
 * Everything else (teams, players, ruleset) hangs off this. Idempotent:
 * if an auction already exists, just returns it rather than erroring —
 * an Admin re-clicking "Create auction" shouldn't create a duplicate.
 */
export async function ensureAuctionAction(auctionName: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const supabase = await createClient();
  const adminDb = createAdminClient();

  const { data: existing } = await supabase
    .from("auctions")
    .select("id")
    .eq("org_id", user.orgId)
    .limit(1)
    .maybeSingle();

  if (existing) return { success: true, auctionId: existing.id };

  const { data: auction, error } = await adminDb
    .from("auctions")
    .insert({ org_id: user.orgId, name: auctionName || "Auction", status: "draft", created_by: user.userId })
    .select()
    .single();

  if (error) {
    Sentry.captureException(error, { tags: { area: "admin_setup" } });
    return { error: error.message };
  }

  // A sensible default ruleset — Admin can adjust via the rules builder.
  // Without SOME ruleset row, the owner/auctioneer screens will fail to
  // load (they .single() this table), so we create one immediately.
  const { error: rulesetErr } = await adminDb.from("auction_rulesets").insert({
    auction_id: auction.id,
    currency_type: "real",
    currency_code: "INR",
    currency_symbol: "₹",
    currency_name: "Rupee",
    purse_per_team: 10000000,
    min_squad_size: 11,
    max_squad_size: 15,
    soft_close_seconds: 10,
    unsold_policy: "return_to_pool_end_of_round",
    categories: [
      { name: "Category A", basePrice: 200000, tiers: [{ upTo: null, increment: 50000 }] },
      { name: "Category B", basePrice: 100000, tiers: [{ upTo: null, increment: 25000 }] },
    ],
  });

  if (rulesetErr) {
    Sentry.captureException(rulesetErr, { tags: { area: "admin_setup" } });
    return { error: rulesetErr.message };
  }

  revalidatePath("/admin");
  return { success: true, auctionId: auction.id };
}

export async function updateRulesetAction(auctionId: string, updates: {
  purse_per_team: number;
  min_squad_size: number;
  max_squad_size: number;
  soft_close_seconds: number;
  currency_type: "real" | "custom";
  currency_symbol: string;
  currency_name: string;
  categories: { name: string; basePrice: number; tiers: { upTo: number | null; increment: number }[] }[];
  max_retentions_per_team: number;
  max_overseas_per_team: number | null;
  role_quotas: { role: string; minCount: number }[];
}) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  if (updates.max_retentions_per_team >= updates.max_squad_size) {
    return { error: "Max retentions must leave at least one squad slot open for the live auction." };
  }

  const { error } = await adminDb
    .from("auction_rulesets")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("auction_id", auctionId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function createTeamAction(auctionId: string, name: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: ruleset } = await adminDb
    .from("auction_rulesets")
    .select("purse_per_team")
    .eq("auction_id", auctionId)
    .single();

  const { error } = await adminDb.from("teams").insert({
    auction_id: auctionId,
    name,
    purse_remaining: ruleset?.purse_per_team ?? 0,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

/** Edits an existing team's name and/or purse. Purse is editable directly
 * here since changing the ruleset's purse-per-team does NOT retroactively
 * update teams already created — this lets an Admin manually sync it if
 * needed, or correct a mistake, without needing to delete and recreate
 * the team. */
export async function updateTeamAction(teamId: string, updates: { name: string; purseRemaining: number }) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { error: updateErr } = await adminDb
    .from("teams")
    .update({ name: updates.name, purse_remaining: updates.purseRemaining })
    .eq("id", teamId);

  if (updateErr) return { error: updateErr.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function addPlayerAction(params: {
  fullName: string;
  dob: string | null;
  cricclubsId: string | null;
  category: string;
  basePrice: number;
  auctionId: string;
  isOverseas?: boolean;
}) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: player, error: playerErr } = await adminDb
    .from("players")
    .insert({
      org_id: user.orgId,
      full_name: params.fullName,
      dob: params.dob || null,
      cricclubs_id: params.cricclubsId || null,
      cricclubs_id_status: params.cricclubsId ? "unverified" : "unverified",
      cricclubs_id_source: params.cricclubsId ? "admin_import" : null,
      is_overseas: params.isOverseas ?? false,
    })
    .select()
    .single();

  if (playerErr) return { error: playerErr.message };

  // Also enter them directly into the current auction's pool — for the
  // MVP admin flow, adding a player and entering them into the pool is
  // treated as one step rather than two separate screens.
  const { error: poolErr } = await adminDb.from("auction_players").insert({
    auction_id: params.auctionId,
    player_id: player.id,
    category: params.category,
    base_price: params.basePrice,
    status: "pending",
  });

  if (poolErr) return { error: poolErr.message };

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Invites a real owner: creates their auth account + app profile + org
 * membership + team assignment, all in one step, and returns a temporary
 * password for the Admin to share with them out-of-band (email/text/etc —
 * this app doesn't send email itself yet).
 */
export async function inviteOwnerAction(params: { email: string; fullName: string; teamId: string }) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const tempPassword = `iOx-${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`;

  const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
    email: params.email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authErr) {
    return { error: authErr.message };
  }

  const { data: profile, error: profileErr } = await adminDb
    .from("users")
    .insert({ auth_user_id: authUser.user.id, email: params.email, full_name: params.fullName })
    .select()
    .single();

  if (profileErr) return { error: profileErr.message };

  const { error: membershipErr } = await adminDb
    .from("org_memberships")
    .insert({ org_id: user.orgId, user_id: profile.id, role: "owner" });

  if (membershipErr) return { error: membershipErr.message };

  const { error: teamOwnerErr } = await adminDb
    .from("team_owners")
    .insert({ team_id: params.teamId, user_id: profile.id });

  if (teamOwnerErr) return { error: teamOwnerErr.message };

  revalidatePath("/admin");
  return { success: true, tempPassword, email: params.email };
}

/** Invites an Auctioneer the same way — separate action since the role differs. */
export async function inviteAuctioneerAction(params: { email: string; fullName: string }) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const tempPassword = `iOx-${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`;

  const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
    email: params.email,
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr) return { error: authErr.message };

  const { data: profile, error: profileErr } = await adminDb
    .from("users")
    .insert({ auth_user_id: authUser.user.id, email: params.email, full_name: params.fullName })
    .select()
    .single();
  if (profileErr) return { error: profileErr.message };

  const { error: membershipErr } = await adminDb
    .from("org_memberships")
    .insert({ org_id: user.orgId, user_id: profile.id, role: "auctioneer" });
  if (membershipErr) return { error: membershipErr.message };

  revalidatePath("/admin");
  return { success: true, tempPassword, email: params.email };
}

export interface BulkPlayerRow {
  fullName: string;
  cricclubsId: string;
  dob: string | null;
  category: string | null;
  isOverseas: boolean;
}

export interface BulkUploadResult {
  added: number;
  failed: number;
  errors: { row: number; fullName: string; message: string }[];
}

/**
 * Bulk-inserts players from a parsed CSV. Name and CricClubs ID are
 * mandatory per row (validated client-side before this is called, but
 * re-checked here since server actions should never trust the client).
 * Each row is processed independently — one bad row doesn't block the
 * rest of the batch, matching the same "don't let one failure stop
 * everything" pattern used by the CricClubs sync.
 */
export async function bulkAddPlayersAction(
  auctionId: string,
  rows: BulkPlayerRow[]
): Promise<BulkUploadResult | { error: string }> {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: ruleset } = await adminDb
    .from("auction_rulesets")
    .select("categories")
    .eq("auction_id", auctionId)
    .single();

  const categories = (ruleset?.categories as { name: string; basePrice: number }[]) ?? [];
  const defaultCategory = categories[0];

  if (!defaultCategory) {
    return { error: "Auction has no categories configured — set up rules before bulk-adding players." };
  }

  const result: BulkUploadResult = { added: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.fullName?.trim() || !row.cricclubsId?.trim()) {
      result.failed++;
      result.errors.push({ row: i + 1, fullName: row.fullName || "(blank)", message: "Missing name or CricClubs ID" });
      continue;
    }

    const matchedCategory = categories.find((c) => c.name === row.category) ?? defaultCategory;

    try {
      const { data: player, error: playerErr } = await adminDb
        .from("players")
        .insert({
          org_id: user.orgId,
          full_name: row.fullName.trim(),
          dob: row.dob || null,
          cricclubs_id: row.cricclubsId.trim(),
          cricclubs_id_status: "unverified",
          cricclubs_id_source: "admin_import",
          is_overseas: row.isOverseas,
        })
        .select()
        .single();

      if (playerErr) {
        result.failed++;
        result.errors.push({ row: i + 1, fullName: row.fullName, message: playerErr.message });
        continue;
      }

      const { error: poolErr } = await adminDb.from("auction_players").insert({
        auction_id: auctionId,
        player_id: player.id,
        category: matchedCategory.name,
        base_price: matchedCategory.basePrice,
        status: "pending",
      });

      if (poolErr) {
        result.failed++;
        result.errors.push({ row: i + 1, fullName: row.fullName, message: poolErr.message });
        continue;
      }

      result.added++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        row: i + 1,
        fullName: row.fullName,
        message: err instanceof Error ? err.message : "Unknown error",
      });
      Sentry.captureException(err, { tags: { area: "bulk_player_upload" }, extra: { row: i + 1 } });
    }
  }

  revalidatePath("/admin");
  return result;
}

/**
 * Edits a player's core profile (name/DOB/CricClubs ID) — always safe to
 * change. Category and base price live on auction_players, and are only
 * editable while the player is still 'pending' (i.e. hasn't gone through
 * a live lot yet) — once sold/unsold, those values are historical record
 * of what actually happened in the auction and shouldn't be rewritten.
 */
export async function editPlayerAction(params: {
  playerId: string;
  auctionId: string;
  fullName: string;
  dob: string | null;
  cricclubsId: string | null;
  category: string;
  basePrice: number;
  roleOverride?: string | null;
  isOverseas?: boolean;
}) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { error: playerErr } = await adminDb
    .from("players")
    .update({
      full_name: params.fullName,
      dob: params.dob || null,
      cricclubs_id: params.cricclubsId || null,
      role_override: params.roleOverride || null,
      ...(params.isOverseas !== undefined ? { is_overseas: params.isOverseas } : {}),
    })
    .eq("id", params.playerId)
    .eq("org_id", user.orgId);

  if (playerErr) return { error: playerErr.message };

  const { data: auctionPlayer } = await adminDb
    .from("auction_players")
    .select("status")
    .eq("auction_id", params.auctionId)
    .eq("player_id", params.playerId)
    .maybeSingle();

  if (auctionPlayer && auctionPlayer.status === "pending") {
    const { error: poolErr } = await adminDb
      .from("auction_players")
      .update({ category: params.category, base_price: params.basePrice })
      .eq("auction_id", params.auctionId)
      .eq("player_id", params.playerId);
    if (poolErr) return { error: poolErr.message };
  }

  revalidatePath("/admin");
  return { success: true, categoryLocked: auctionPlayer?.status !== "pending" };
}

/**
 * Deletes a player entirely — only allowed while their auction_players
 * status is 'pending' (never opened in a lot). Deleting cascades to
 * auction_players, any queued lot, and CricClubs/CricIQ snapshots
 * automatically (all set up with ON DELETE CASCADE in the schema). Once a
 * player has been through a live lot (in_lot/sold/unsold), deletion is
 * refused — that's real auction history now, not draft data.
 */
export async function deletePlayerAction(playerId: string, auctionId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: auctionPlayer } = await adminDb
    .from("auction_players")
    .select("status")
    .eq("auction_id", auctionId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (auctionPlayer && auctionPlayer.status !== "pending") {
    return {
      error: `Can't delete — this player's auction status is "${auctionPlayer.status}", which means they've already gone through the live auction. Deleting would erase real auction history.`,
    };
  }

  const { error } = await adminDb.from("players").delete().eq("id", playerId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export interface BulkActionResult {
  succeeded: number;
  skipped: number;
  skippedReasons: { playerId: string; reason: string }[];
}

/**
 * Bulk delete — same safety rule as the single-player version applies to
 * each row independently: only players still 'pending' (never gone
 * through a live lot) are actually deleted. Anything already sold/unsold
 * is skipped and reported, never silently destroyed.
 */
export async function bulkDeletePlayersAction(playerIds: string[], auctionId: string): Promise<BulkActionResult> {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const result: BulkActionResult = { succeeded: 0, skipped: 0, skippedReasons: [] };

  const { data: statuses } = await adminDb
    .from("auction_players")
    .select("player_id, status")
    .eq("auction_id", auctionId)
    .in("player_id", playerIds);

  const statusByPlayer = new Map(
    (statuses ?? []).map((s: { player_id: string; status: string }) => [s.player_id, s.status])
  );

  const deletableIds: string[] = [];
  for (const id of playerIds) {
    const status = statusByPlayer.get(id);
    if (status && status !== "pending") {
      result.skipped++;
      result.skippedReasons.push({ playerId: id, reason: `Already ${status} — can't delete auction history` });
    } else {
      deletableIds.push(id);
    }
  }

  if (deletableIds.length > 0) {
    const { error, count } = await adminDb
      .from("players")
      .delete({ count: "exact" })
      .in("id", deletableIds)
      .eq("org_id", user.orgId);
    if (error) {
      Sentry.captureException(error, { tags: { area: "bulk_delete_players" } });
    } else {
      result.succeeded = count ?? deletableIds.length;
    }
  }

  revalidatePath("/admin");
  return result;
}

/** Bulk-reassigns category (and its base price) — same 'pending only' rule as single edit. */
export async function bulkReassignCategoryAction(
  playerIds: string[],
  auctionId: string,
  category: string
): Promise<BulkActionResult> {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const result: BulkActionResult = { succeeded: 0, skipped: 0, skippedReasons: [] };

  const { data: ruleset } = await adminDb
    .from("auction_rulesets")
    .select("categories")
    .eq("auction_id", auctionId)
    .single();

  const categories = (ruleset?.categories as { name: string; basePrice: number }[]) ?? [];
  const targetCategory = categories.find((c) => c.name === category);
  if (!targetCategory) return { ...result, skipped: playerIds.length, skippedReasons: [{ playerId: "", reason: "Category not found" }] };

  const { data: rows } = await adminDb
    .from("auction_players")
    .select("player_id, status")
    .eq("auction_id", auctionId)
    .in("player_id", playerIds);

  const eligibleIds: string[] = [];
  for (const row of rows ?? []) {
    if (row.status === "pending") {
      eligibleIds.push(row.player_id);
    } else {
      result.skipped++;
      result.skippedReasons.push({ playerId: row.player_id, reason: `Already ${row.status} — locked` });
    }
  }

  if (eligibleIds.length > 0) {
    const { error, count } = await adminDb
      .from("auction_players")
      .update({ category: targetCategory.name, base_price: targetCategory.basePrice }, { count: "exact" })
      .eq("auction_id", auctionId)
      .in("player_id", eligibleIds);
    if (error) {
      Sentry.captureException(error, { tags: { area: "bulk_reassign_category" } });
    } else {
      result.succeeded = count ?? eligibleIds.length;
    }
  }

  revalidatePath("/admin");
  return result;
}

export interface CricIQRow {
  cricclubsId: string;
  playerName: string;
  status: string;
  error: string;
  primaryRole: string;
  persona: string;
  superpowers: string;
  strengths: string;
  watchOuts: string;
  patterns: string;
  runs: number | null;
  innings: number | null;
  notOuts: number | null;
  battingAvg: number | null;
  strikeRate: number | null;
  highestScore: number | null;
  fifties: number | null;
  hundreds: number | null;
  fours: number | null;
  sixes: number | null;
  ducks: number | null;
  boundaryPct: number | null;
  wickets: number | null;
  overs: number | null;
  maidens: number | null;
  economy: number | null;
  bowlingAvg: number | null;
  bowlingSr: number | null;
  roleBasis: string;
  battingScore: number | null;
  bowlingScore: number | null;
  performanceScore: number | null;
  raw: Record<string, string>;
}

export interface CricIQUploadResult {
  matched: number;
  unmatched: number;
  skipped: number;
  unmatchedNames: string[];
  unmatchedRows: CricIQRow[];
  skippedReasons: { name: string; reason: string }[];
}

/**
 * Ingests a CricIQ tournament report CSV. Matches each row to an existing
 * player by CricClubs ID (the shared key between both systems — exact
 * match, no fuzzy logic needed since both apps track the same ID). Rows
 * with a non-"OK" status or a populated Error column are skipped rather
 * than stored as if they were valid insights.
 *
 * Like CricClubs snapshots, this is append-only: every upload writes new
 * rows, never overwrites, preserving full history of what CricIQ reported
 * over time.
 */
/** Shared insert-shape builder used both for normal matched uploads and
 * for players created on-the-fly from previously-unmatched CricIQ rows —
 * keeps the two paths from silently drifting apart. */
function buildCricIQSnapshotRow(playerId: string, userId: string, row: CricIQRow) {
  const summaryParts = [
    row.persona && `Persona: ${row.persona}`,
    row.superpowers && `Superpowers: ${row.superpowers}`,
    row.strengths && `Strengths: ${row.strengths}`,
    row.watchOuts && `Watch outs: ${row.watchOuts}`,
    row.patterns && `Patterns: ${row.patterns}`,
  ].filter(Boolean);

  return {
    player_id: playerId,
    synced_by: userId,
    raw_payload: row.raw,
    summary_text: summaryParts.join(" · "),
    runs: row.runs,
    innings: row.innings,
    not_outs: row.notOuts,
    batting_avg: row.battingAvg,
    strike_rate: row.strikeRate,
    highest_score: row.highestScore,
    fifties: row.fifties,
    hundreds: row.hundreds,
    fours: row.fours,
    sixes: row.sixes,
    ducks: row.ducks,
    boundary_pct: row.boundaryPct,
    wickets: row.wickets,
    overs: row.overs,
    maidens: row.maidens,
    economy: row.economy,
    bowling_avg: row.bowlingAvg,
    bowling_sr: row.bowlingSr,
    primary_role: row.primaryRole,
    persona: row.persona,
    role_basis: row.roleBasis,
    batting_score: row.battingScore,
    bowling_score: row.bowlingScore,
    performance_score: row.performanceScore,
  };
}

export async function bulkUploadCricIQAction(rows: CricIQRow[]): Promise<CricIQUploadResult> {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const result: CricIQUploadResult = {
    matched: 0,
    unmatched: 0,
    skipped: 0,
    unmatchedNames: [],
    unmatchedRows: [],
    skippedReasons: [],
  };

  const { data: orgPlayers } = await adminDb
    .from("players")
    .select("id, cricclubs_id")
    .eq("org_id", user.orgId)
    .not("cricclubs_id", "is", null);

  const playerIdByCricClubsId = new Map<string, string>(
    (orgPlayers ?? []).map((p: { id: string; cricclubs_id: string }) => [p.cricclubs_id, p.id])
  );

  for (const row of rows) {
    if (row.status && row.status.toUpperCase() !== "OK") {
      result.skipped++;
      result.skippedReasons.push({ name: row.playerName, reason: `Status: ${row.status}` });
      continue;
    }
    if (row.error) {
      result.skipped++;
      result.skippedReasons.push({ name: row.playerName, reason: row.error });
      continue;
    }

    const playerId = playerIdByCricClubsId.get(row.cricclubsId);
    if (!playerId) {
      // Not an error — this is expected when a CricIQ report includes
      // players who haven't been added to the pool yet. Return the full
      // row so the UI can offer "add to pool" without re-uploading.
      result.unmatched++;
      result.unmatchedNames.push(`${row.playerName} (${row.cricclubsId})`);
      result.unmatchedRows.push(row);
      continue;
    }

    const { error: insertErr } = await adminDb.from("criciq_snapshots").insert(buildCricIQSnapshotRow(playerId, user.userId, row));

    if (insertErr) {
      Sentry.captureException(insertErr, { tags: { area: "criciq_upload" }, extra: { cricclubsId: row.cricclubsId } });
      result.skipped++;
      result.skippedReasons.push({ name: row.playerName, reason: insertErr.message });
    } else {
      result.matched++;
    }
  }

  revalidatePath("/admin");
  return result;
}

export interface AddUnmatchedResult {
  added: number;
  failed: number;
  errors: { name: string; message: string }[];
}

/**
 * Takes previously-unmatched CricIQ rows (full data, not just names — the
 * client already has this from its own parsed CSV, so no need to re-parse
 * or re-upload) and, for each one: creates the player, enters them into
 * the auction pool under the given category, and immediately writes their
 * CricIQ snapshot — all in one step, so the Admin never has to re-run the
 * CricIQ upload after adding players it flagged as missing.
 */
export async function addUnmatchedCricIQPlayersAction(
  auctionId: string,
  rows: CricIQRow[],
  category: string
): Promise<AddUnmatchedResult> {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const result: AddUnmatchedResult = { added: 0, failed: 0, errors: [] };

  const { data: ruleset } = await adminDb
    .from("auction_rulesets")
    .select("categories")
    .eq("auction_id", auctionId)
    .single();
  const categories = (ruleset?.categories as { name: string; basePrice: number }[]) ?? [];
  const matchedCategory = categories.find((c) => c.name === category) ?? categories[0];

  if (!matchedCategory) {
    return { added: 0, failed: rows.length, errors: rows.map((r) => ({ name: r.playerName, message: "No category configured." })) };
  }

  for (const row of rows) {
    try {
      const { data: player, error: playerErr } = await adminDb
        .from("players")
        .insert({
          org_id: user.orgId,
          full_name: row.playerName,
          cricclubs_id: row.cricclubsId,
          cricclubs_id_status: "unverified",
          cricclubs_id_source: "admin_import",
        })
        .select()
        .single();
      if (playerErr) {
        result.failed++;
        result.errors.push({ name: row.playerName, message: playerErr.message });
        continue;
      }

      const { error: poolErr } = await adminDb.from("auction_players").insert({
        auction_id: auctionId,
        player_id: player.id,
        category: matchedCategory.name,
        base_price: matchedCategory.basePrice,
        status: "pending",
      });
      if (poolErr) {
        result.failed++;
        result.errors.push({ name: row.playerName, message: poolErr.message });
        continue;
      }

      const { error: snapshotErr } = await adminDb
        .from("criciq_snapshots")
        .insert(buildCricIQSnapshotRow(player.id, user.userId, row));
      if (snapshotErr) {
        result.failed++;
        result.errors.push({ name: row.playerName, message: snapshotErr.message });
        continue;
      }

      result.added++;
    } catch (err) {
      result.failed++;
      result.errors.push({ name: row.playerName, message: err instanceof Error ? err.message : "Unknown error" });
      Sentry.captureException(err, { tags: { area: "add_unmatched_criciq_players" } });
    }
  }

  revalidatePath("/admin");
  return result;
}

/** Sets the org's brand accent color — every screen derives its hover/tint
 * variants from this one value automatically (see app/globals.css). */
export async function updateOrgThemeAction(hexColor: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return { error: "Enter a valid hex color, e.g. #1B6B4A" };
  }

  const { error } = await adminDb.from("orgs").update({ theme_color: hexColor }).eq("id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Deletes a team — only allowed if the team has never placed a bid and
 * never won a player. `bids.team_id` and `auction_players.sold_to_team_id`
 * are NOT cascade-deleted from teams (deliberately, in the schema) — a
 * team with any bidding history is real auction record, not draft data,
 * same principle as player deletion. team_owners rows DO cascade
 * automatically since that's just an assignment, not a historical record.
 */
export async function deleteTeamAction(teamId: string, auctionId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { count: soldCount } = await adminDb
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", auctionId)
    .eq("sold_to_team_id", teamId);

  if ((soldCount ?? 0) > 0) {
    return { error: `Can't delete — this team has already won ${soldCount} player(s). Deleting would erase real auction history.` };
  }

  const { count: bidCount } = await adminDb
    .from("bids")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if ((bidCount ?? 0) > 0) {
    return { error: "Can't delete — this team has placed bids in this auction. Deleting would erase real auction history." };
  }

  const { error } = await adminDb.from("teams").delete().eq("id", teamId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Retains a player to a team before the live auction — represented as an
 * immediate "sale" at an admin-set price (see migration 0008 for why).
 * Only allowed while the auction hasn't gone live yet, and only within
 * the configured max_retentions_per_team / max_overseas_per_team caps —
 * both hard limits, unlike role_quotas which are targets, not blockers.
 */
export async function retainPlayerAction(params: {
  auctionId: string;
  playerId: string;
  teamId: string;
  price: number;
}) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: auction } = await adminDb.from("auctions").select("status").eq("id", params.auctionId).single();
  if (auction && !["draft", "configured"].includes(auction.status)) {
    return { error: "Can't change retentions once the auction has gone live." };
  }

  const { data: ruleset } = await adminDb
    .from("auction_rulesets")
    .select("max_retentions_per_team, max_overseas_per_team, max_squad_size")
    .eq("auction_id", params.auctionId)
    .single();
  if (!ruleset) return { error: "Ruleset not found." };

  const { data: auctionPlayer } = await adminDb
    .from("auction_players")
    .select("id, status, category")
    .eq("auction_id", params.auctionId)
    .eq("player_id", params.playerId)
    .maybeSingle();
  if (!auctionPlayer) return { error: "Player is not in this auction's pool." };
  if (auctionPlayer.status !== "pending") {
    return { error: `Player is already ${auctionPlayer.status} — can't retain.` };
  }

  const { count: currentRetained } = await adminDb
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", params.auctionId)
    .eq("retained_by_team_id", params.teamId)
    .eq("is_retained", true);

  if ((currentRetained ?? 0) >= ruleset.max_retentions_per_team) {
    return { error: `This team has already used all ${ruleset.max_retentions_per_team} retention slot(s).` };
  }

  const { count: currentSquadSize } = await adminDb
    .from("auction_players")
    .select("id", { count: "exact", head: true })
    .eq("auction_id", params.auctionId)
    .eq("sold_to_team_id", params.teamId)
    .eq("status", "sold");

  if ((currentSquadSize ?? 0) >= ruleset.max_squad_size) {
    return { error: "This team's squad is already at maximum size." };
  }

  if (ruleset.max_overseas_per_team !== null) {
    const { data: player } = await adminDb.from("players").select("is_overseas").eq("id", params.playerId).single();
    if (player?.is_overseas) {
      const { data: soldIds } = await adminDb
        .from("auction_players")
        .select("player_id")
        .eq("auction_id", params.auctionId)
        .eq("sold_to_team_id", params.teamId)
        .eq("status", "sold");
      const playerIds = (soldIds ?? []).map((r: { player_id: string }) => r.player_id);
      const { count: overseasCount } = playerIds.length
        ? await adminDb
            .from("players")
            .select("id", { count: "exact", head: true })
            .in("id", playerIds)
            .eq("is_overseas", true)
        : { count: 0 };
      if ((overseasCount ?? 0) >= ruleset.max_overseas_per_team) {
        return { error: `This team is already at its overseas-player cap (${ruleset.max_overseas_per_team}).` };
      }
    }
  }

  const { error: updateErr } = await adminDb
    .from("auction_players")
    .update({
      status: "sold",
      sold_to_team_id: params.teamId,
      sold_price: params.price,
      is_retained: true,
      retained_by_team_id: params.teamId,
    })
    .eq("id", auctionPlayer.id);
  if (updateErr) return { error: updateErr.message };

  const { data: team } = await adminDb.from("teams").select("purse_remaining").eq("id", params.teamId).single();
  if (team) {
    await adminDb.from("teams").update({ purse_remaining: team.purse_remaining - params.price }).eq("id", params.teamId);
  }

  await adminDb.from("audit_log").insert({
    org_id: user.orgId,
    auction_id: params.auctionId,
    actor_user_id: user.userId,
    action: "player.retained",
    entity_type: "auction_player",
    entity_id: auctionPlayer.id,
    metadata: { team_id: params.teamId, price: params.price },
  });

  revalidatePath("/admin");
  return { success: true };
}

/** Reverses a retention — only while the auction hasn't gone live, refunds the team's purse. */
export async function unretainPlayerAction(auctionId: string, playerId: string) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { data: auction } = await adminDb.from("auctions").select("status").eq("id", auctionId).single();
  if (auction && !["draft", "configured"].includes(auction.status)) {
    return { error: "Can't change retentions once the auction has gone live." };
  }

  const { data: auctionPlayer } = await adminDb
    .from("auction_players")
    .select("id, sold_to_team_id, sold_price, is_retained")
    .eq("auction_id", auctionId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (!auctionPlayer || !auctionPlayer.is_retained) return { error: "Player is not currently retained." };

  const { error: updateErr } = await adminDb
    .from("auction_players")
    .update({ status: "pending", sold_to_team_id: null, sold_price: null, is_retained: false, retained_by_team_id: null })
    .eq("id", auctionPlayer.id);
  if (updateErr) return { error: updateErr.message };

  if (auctionPlayer.sold_to_team_id && auctionPlayer.sold_price) {
    const { data: team } = await adminDb
      .from("teams")
      .select("purse_remaining")
      .eq("id", auctionPlayer.sold_to_team_id)
      .single();
    if (team) {
      await adminDb
        .from("teams")
        .update({ purse_remaining: team.purse_remaining + auctionPlayer.sold_price })
        .eq("id", auctionPlayer.sold_to_team_id);
    }
  }

  revalidatePath("/admin");
  return { success: true };
}

/** Sets/clears a player's overseas flag — used for the overseas-quota cap. */
export async function setPlayerOverseasAction(playerId: string, isOverseas: boolean) {
  const user = await getCurrentUser();
  requireRole(user, ["org_admin"]);
  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("players")
    .update({ is_overseas: isOverseas })
    .eq("id", playerId)
    .eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
