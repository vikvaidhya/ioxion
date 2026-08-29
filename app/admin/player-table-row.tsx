"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editPlayerAction, deletePlayerAction } from "./setup-actions";
import { CheckCircle2, Circle, Pencil, Trash2, X, Check, Lock, ChevronDown, ChevronRight, PenLine } from "lucide-react";
import { CricIQStatsPanel } from "@/components/criciq-stats-panel";
import { RoleScoreBadge } from "@/components/role-score-badge";

interface Player {
  id: string;
  full_name: string;
  cricclubs_id: string | null;
  cricclubs_id_status: string;
  dob: string | null;
  role_override: string | null;
}

interface Snapshot {
  matches_played: number | null;
  batting_avg: number | null;
  batting_sr: number | null;
  synced_at: string;
}

interface CricIQSnapshot {
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
  status: string;
  category: string;
  base_price: number;
}

interface Props {
  player: Player;
  snapshot?: Snapshot;
  criciq?: CricIQSnapshot;
  auctionPlayer?: AuctionPlayerInfo;
  auctionId: string;
  categories: { name: string; basePrice: number }[];
  selected: boolean;
  onToggleSelect: () => void;
}

const ROLE_OPTIONS = ["Primary Batsman", "Primary Bowler", "Batting All-Rounder", "Bowling All-Rounder"];

export function PlayerTableRow({ player, snapshot, criciq, auctionPlayer, auctionId, categories, selected, onToggleSelect }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(player.full_name);
  const [dob, setDob] = useState(player.dob ?? "");
  const [cricclubsId, setCricclubsId] = useState(player.cricclubs_id ?? "");
  const [category, setCategory] = useState(auctionPlayer?.category ?? categories[0]?.name ?? "");
  const [roleOverride, setRoleOverride] = useState(player.role_override ?? "");

  const isLocked = auctionPlayer && auctionPlayer.status !== "pending";
  const selectedCategory = categories.find((c) => c.name === category);

  // The role actually shown everywhere: a manual admin correction takes
  // precedence over whatever CricIQ's report says, but the underlying
  // score numbers always come from the real CricIQ data regardless.
  const effectiveRole = player.role_override || criciq?.primary_role || null;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await editPlayerAction({
        playerId: player.id,
        auctionId,
        fullName,
        dob: dob || null,
        cricclubsId: cricclubsId || null,
        category,
        basePrice: selectedCategory?.basePrice ?? auctionPlayer?.base_price ?? 0,
        roleOverride: roleOverride || null,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deletePlayerAction(player.id, auctionId);
      if (result?.error) {
        setError(result.error);
        setConfirmingDelete(false);
      } else {
        router.refresh();
      }
    });
  };

  if (editing) {
    return (
      <tr className="border-b border-[var(--paper)] bg-[var(--paper)]">
        <td className="px-3 py-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} className="rounded" />
        </td>
        <td className="px-5 py-2" colSpan={9}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="px-2 py-1 rounded border border-[var(--line)] text-sm w-40"
              placeholder="Name"
            />
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="px-2 py-1 rounded border border-[var(--line)] text-sm"
            />
            <input
              value={cricclubsId}
              onChange={(e) => setCricclubsId(e.target.value)}
              className="px-2 py-1 rounded border border-[var(--line)] text-sm w-36"
              placeholder="CricClubs ID"
            />
            {isLocked ? (
              <span className="flex items-center gap-1 text-xs text-[var(--ink-faint)] px-2">
                <Lock size={11} /> {category} (locked — already {auctionPlayer?.status})
              </span>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-2 py-1 rounded border border-[var(--line)] text-sm"
              >
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={roleOverride}
              onChange={(e) => setRoleOverride(e.target.value)}
              className="px-2 py-1 rounded border border-[var(--line)] text-sm"
              title="Override CricIQ's role classification"
            >
              <option value="">
                {criciq?.primary_role ? `(from CricIQ: ${criciq.primary_role})` : "Role (no CricIQ data)"}
              </option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="p-1.5 rounded bg-[var(--brand)] text-white disabled:opacity-50"
              title="Save"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded border border-[var(--line)] text-[var(--ink-soft)]"
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
          {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <>
    <tr
      className="border-b border-[var(--paper)] last:border-0 group cursor-pointer hover:bg-[var(--paper)] transition-colors"
      onClick={() => criciq && setStatsExpanded((v) => !v)}
    >
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="rounded" />
      </td>
      <td className="px-5 py-2.5">{player.full_name}</td>
      <td className="px-5 py-2.5 font-mono text-xs text-[var(--ink-soft)]">{player.cricclubs_id}</td>
      <td className="px-5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs">
          {player.cricclubs_id_status === "verified" ? (
            <CheckCircle2 size={13} className="text-[var(--brand)]" />
          ) : (
            <Circle size={13} className="text-[var(--ink-faint)]" />
          )}
          {player.cricclubs_id_status}
        </span>
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-1">
          <RoleScoreBadge
            primaryRole={effectiveRole}
            battingScore={criciq?.batting_score ?? null}
            bowlingScore={criciq?.bowling_score ?? null}
            size="sm"
          />
          {player.role_override && (
            <PenLine size={10} className="text-[var(--warning)] flex-shrink-0" aria-label="Manually overridden" />
          )}
        </div>
      </td>
      <td className="px-5 py-2.5 font-mono text-xs text-[var(--ink-soft)]">{snapshot?.matches_played ?? "—"}</td>
      <td className="px-5 py-2.5 font-mono text-xs text-[var(--ink-soft)]">{snapshot?.batting_avg ?? "—"}</td>
      <td className="px-5 py-2.5 font-mono text-xs text-[var(--ink-soft)]">{snapshot?.batting_sr ?? "—"}</td>
      <td className="px-5 py-2.5 text-xs text-[var(--ink-faint)]">
        <div className="flex items-center justify-between gap-2">
          <span>{snapshot?.synced_at ? new Date(snapshot.synced_at).toLocaleTimeString() : "Never"}</span>
          <div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setEditing(true)} className="p-1 text-[var(--ink-soft)] hover:text-[var(--brand)]" title="Edit">
              <Pencil size={12} />
            </button>
            {confirmingDelete ? (
              <>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="text-[10px] font-semibold text-[var(--danger)] px-1.5 py-0.5 rounded bg-[var(--danger-soft)]"
                >
                  Confirm?
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="p-1 text-[var(--ink-soft)]">
                  <X size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="p-1 text-[var(--ink-soft)] hover:text-[var(--danger)]"
                title={isLocked ? "Cannot delete — already auctioned" : "Delete"}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        {error && !editing && <p className="text-[10px] text-[var(--danger)] mt-1">{error}</p>}
      </td>
      <td className="px-5 py-2.5 text-xs max-w-[220px]">
        {criciq ? (
          <div className="flex items-center gap-1 text-left w-full">
            {statsExpanded ? <ChevronDown size={12} className="flex-shrink-0" /> : <ChevronRight size={12} className="flex-shrink-0" />}
            <span className="text-[var(--ink-soft)] line-clamp-1">{criciq.persona || "View stats"}</span>
          </div>
        ) : (
          <span className="text-[var(--ink-faint)]">—</span>
        )}
      </td>
    </tr>
    {statsExpanded && criciq && (
      <tr className="border-b border-[var(--paper)] bg-[var(--paper)]">
        <td></td>
        <td colSpan={9} className="px-5 py-3">
          <CricIQStatsPanel
            variant="full"
            batting={{
              runs: criciq.runs,
              innings: criciq.innings,
              notOuts: criciq.not_outs,
              battingAvg: criciq.batting_avg,
              strikeRate: criciq.strike_rate,
              highestScore: criciq.highest_score,
              fifties: criciq.fifties,
              hundreds: criciq.hundreds,
              fours: criciq.fours,
              sixes: criciq.sixes,
              ducks: criciq.ducks,
              boundaryPct: criciq.boundary_pct,
            }}
            bowling={{
              wickets: criciq.wickets,
              overs: criciq.overs,
              maidens: criciq.maidens,
              economy: criciq.economy,
              bowlingAvg: criciq.bowling_avg,
              bowlingSr: criciq.bowling_sr,
            }}
          />
          {criciq.summary_text && (
            <p className="text-xs text-[var(--ink-soft)] mt-3 pt-3 border-t border-[var(--brand-soft)]">{criciq.summary_text}</p>
          )}
        </td>
      </tr>
    )}
    </>
  );
}
