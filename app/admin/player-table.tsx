"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { PlayerTableRow } from "./player-table-row";
import { bulkDeletePlayersAction, bulkReassignCategoryAction, type BulkActionResult } from "./setup-actions";
import { Trash2, Tag, X, ArrowUpDown, ArrowUp, ArrowDown, Download, Filter } from "lucide-react";

interface Player {
  id: string;
  full_name: string;
  cricclubs_id: string | null;
  cricclubs_id_status: string;
  dob: string | null;
  role_override: string | null;
}

interface Snapshot {
  player_id: string;
  matches_played: number | null;
  batting_avg: number | null;
  batting_sr: number | null;
  synced_at: string;
}

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

interface AuctionPlayerInfo {
  player_id: string;
  status: string;
  category: string;
  base_price: number;
}

interface Props {
  players: Player[];
  snapshotByPlayer: Map<string, Snapshot>;
  criciqByPlayer: Map<string, CricIQSnapshot>;
  auctionPlayerByPlayer: Map<string, AuctionPlayerInfo>;
  auctionId: string;
  categories: { name: string; basePrice: number }[];
}

type SortKey = "name" | "cricclubs_id" | "verification" | "role" | "matches" | "batting_avg" | "strike_rate" | "last_synced";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "cricclubs_id", label: "CricClubs ID" },
  { key: "verification", label: "Verification" },
  { key: "role", label: "Role & Score" },
  { key: "matches", label: "Matches" },
  { key: "batting_avg", label: "Bat Avg" },
  { key: "strike_rate", label: "Strike Rate" },
  { key: "last_synced", label: "Last synced" },
];

export function PlayerTable({ players, snapshotByPlayer, criciqByPlayer, auctionPlayerByPlayer, auctionId, categories }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkResult, setBulkResult] = useState<{ action: string; result: BulkActionResult } | null>(null);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [reassignCategory, setReassignCategory] = useState(categories[0]?.name ?? "");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filters
  const [filterVerification, setFilterVerification] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [minBattingAvg, setMinBattingAvg] = useState<string>("");
  const [minBowlingWickets, setMinBowlingWickets] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    for (const p of players) {
      const criciq = criciqByPlayer.get(p.id);
      const role = p.role_override || criciq?.primary_role;
      if (role) roles.add(role);
    }
    return Array.from(roles).sort();
  }, [players, criciqByPlayer]);

  const activeFilterCount = [filterVerification, filterRole, minBattingAvg, minBowlingWickets].filter(Boolean).length;

  const clearFilters = () => {
    setFilterVerification("");
    setFilterRole("");
    setMinBattingAvg("");
    setMinBowlingWickets("");
  };

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const snap = snapshotByPlayer.get(p.id);
      const criciq = criciqByPlayer.get(p.id);
      const effectiveRole = p.role_override || criciq?.primary_role || "";

      if (filterVerification && p.cricclubs_id_status !== filterVerification) return false;
      if (filterRole && effectiveRole !== filterRole) return false;
      if (minBattingAvg) {
        const avg = snap?.batting_avg ?? criciq?.batting_avg;
        if (avg === null || avg === undefined || avg < Number(minBattingAvg)) return false;
      }
      if (minBowlingWickets) {
        const wkts = criciq?.wickets;
        if (wkts === null || wkts === undefined || wkts < Number(minBowlingWickets)) return false;
      }
      return true;
    });
  }, [players, snapshotByPlayer, criciqByPlayer, filterVerification, filterRole, minBattingAvg, minBowlingWickets]);

  const allSelected = filteredPlayers.length > 0 && filteredPlayers.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredPlayers.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredPlayers.map((p) => p.id)]));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setConfirmingBulkDelete(false);
    setBulkResult(null);
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeletePlayersAction(Array.from(selected), auctionId);
      setBulkResult({ action: "delete", result });
      setSelected(new Set());
      setConfirmingBulkDelete(false);
      router.refresh();
    });
  };

  const handleBulkReassign = () => {
    startTransition(async () => {
      const result = await bulkReassignCategoryAction(Array.from(selected), auctionId, reassignCategory);
      setBulkResult({ action: "reassign", result });
      setSelected(new Set());
      router.refresh();
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getSortValue = (p: Player, key: SortKey): string | number => {
    const snap = snapshotByPlayer.get(p.id);
    const criciq = criciqByPlayer.get(p.id);
    switch (key) {
      case "name":
        return p.full_name.toLowerCase();
      case "cricclubs_id":
        return p.cricclubs_id ?? "";
      case "verification":
        return p.cricclubs_id_status;
      case "role":
        return (p.role_override || criciq?.primary_role || "").toLowerCase();
      case "matches":
        return snap?.matches_played ?? -1;
      case "batting_avg":
        return snap?.batting_avg ?? -1;
      case "strike_rate":
        return snap?.batting_sr ?? -1;
      case "last_synced":
        return snap?.synced_at ?? "";
    }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return filteredPlayers;
    const copy = [...filteredPlayers];
    copy.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPlayers, sortKey, sortDir, snapshotByPlayer, criciqByPlayer]);

  const handleExportCsv = () => {
    const rows = sortedPlayers.map((p) => {
      const snap = snapshotByPlayer.get(p.id);
      const criciq = criciqByPlayer.get(p.id);
      const ap = auctionPlayerByPlayer.get(p.id);
      return {
        Name: p.full_name,
        DOB: p.dob ?? "",
        "CricClubs ID": p.cricclubs_id ?? "",
        Verification: p.cricclubs_id_status,
        "Primary Role": p.role_override || criciq?.primary_role || "",
        "Role Manually Overridden": p.role_override ? "Yes" : "No",
        "Batting Score": criciq?.batting_score ?? "",
        "Bowling Score": criciq?.bowling_score ?? "",
        "Performance Score": criciq?.performance_score ?? "",
        Category: ap?.category ?? "",
        "Base Price": ap?.base_price ?? "",
        "Auction Status": ap?.status ?? "",
        Matches: snap?.matches_played ?? "",
        "Batting Avg (CricClubs)": snap?.batting_avg ?? "",
        "Strike Rate (CricClubs)": snap?.batting_sr ?? "",
        "CricIQ Persona": criciq?.persona ?? "",
        "Last CricClubs Sync": snap?.synced_at ?? "",
        "Last CricIQ Sync": criciq?.synced_at ?? "",
      };
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iOxion-player-pool-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="px-5 py-2.5 bg-white border-b border-[var(--brand-soft)] flex items-center justify-between">
        <span className="text-xs text-[var(--ink-soft)]">
          Click a column header to sort · click a row to view CricIQ stats
          {activeFilterCount > 0 && ` · showing ${filteredPlayers.length} of ${players.length}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
              activeFilterCount > 0
                ? "border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
            }`}
          >
            <Filter size={13} /> Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filteredPlayers.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="px-5 py-3 bg-[var(--paper)] border-b border-[var(--brand-soft)] flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">
              Verification
            </label>
            <select
              value={filterVerification}
              onChange={(e) => setFilterVerification(e.target.value)}
              className="text-xs px-2 py-1.5 rounded border border-[var(--line)]"
            >
              <option value="">Any</option>
              <option value="unverified">Unverified</option>
              <option value="pending_verification">Pending verification</option>
              <option value="verified">Verified</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="text-xs px-2 py-1.5 rounded border border-[var(--line)]"
            >
              <option value="">Any</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">
              Min batting avg
            </label>
            <input
              type="number"
              value={minBattingAvg}
              onChange={(e) => setMinBattingAvg(e.target.value)}
              placeholder="e.g. 30"
              className="text-xs px-2 py-1.5 rounded border border-[var(--line)] w-24"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">
              Min wickets
            </label>
            <input
              type="number"
              value={minBowlingWickets}
              onChange={(e) => setMinBowlingWickets(e.target.value)}
              placeholder="e.g. 5"
              className="text-xs px-2 py-1.5 rounded border border-[var(--line)] w-24"
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--danger)] hover:underline pb-1.5"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="px-5 py-3 bg-[var(--brand-soft)] border-b border-[var(--line)] flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-[var(--ink-soft)]">{selected.size} selected</span>

          <div className="flex items-center gap-1.5">
            <select
              value={reassignCategory}
              onChange={(e) => setReassignCategory(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[var(--line)]"
            >
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkReassign}
              disabled={isPending}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-white border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50"
            >
              <Tag size={12} /> Reassign category
            </button>
          </div>

          {confirmingBulkDelete ? (
            <button
              onClick={handleBulkDelete}
              disabled={isPending}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-[var(--danger)] text-white disabled:opacity-50"
            >
              <Trash2 size={12} /> Confirm delete {selected.size}?
            </button>
          ) : (
            <button
              onClick={() => setConfirmingBulkDelete(true)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded bg-white border border-[var(--line)] text-[var(--danger)] hover:border-[var(--danger)]"
            >
              <Trash2 size={12} /> Delete selected
            </button>
          )}

          <button onClick={clearSelection} className="ml-auto text-[var(--ink-soft)] hover:text-[var(--ink-soft)]">
            <X size={14} />
          </button>
        </div>
      )}

      {bulkResult && (
        <div className="px-5 py-2.5 bg-white border-b border-[var(--brand-soft)] text-xs">
          <span className="font-semibold text-[var(--brand)]">
            {bulkResult.result.succeeded} {bulkResult.action === "delete" ? "deleted" : "reassigned"}
          </span>
          {bulkResult.result.skipped > 0 && (
            <span className="text-[var(--danger)]"> · {bulkResult.result.skipped} skipped (already auctioned)</span>
          )}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)] border-b border-[var(--brand-soft)]">
            <th className="px-3 py-2.5">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-5 py-2.5 font-semibold cursor-pointer hover:text-[var(--brand)] select-none whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={11} className="opacity-30" />
                  )}
                </span>
              </th>
            ))}
            <th className="px-5 py-2.5 font-semibold">CricIQ Insight</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers.map((p) => (
            <PlayerTableRow
              key={p.id}
              player={p}
              snapshot={snapshotByPlayer.get(p.id)}
              criciq={criciqByPlayer.get(p.id)}
              auctionPlayer={auctionPlayerByPlayer.get(p.id)}
              auctionId={auctionId}
              categories={categories}
              selected={selected.has(p.id)}
              onToggleSelect={() => toggleOne(p.id)}
            />
          ))}
          {sortedPlayers.length === 0 && (
            <tr>
              <td colSpan={10} className="px-5 py-8 text-center text-sm text-[var(--ink-faint)]">
                {players.length === 0
                  ? "No players yet — add your first one above."
                  : "No players match the current filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
