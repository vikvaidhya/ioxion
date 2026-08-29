"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface BattingStats {
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
}

export interface BowlingStats {
  wickets: number | null;
  overs: number | null;
  maidens: number | null;
  economy: number | null;
  bowlingAvg: number | null;
  bowlingSr: number | null;
}

interface Props {
  batting: BattingStats;
  bowling: BowlingStats;
  /** compact = short inline stat line (good for tight spaces like the owner bid card).
   *  full = the full labeled grid (good for the admin expanded panel). */
  variant?: "compact" | "full";
}

const hasAny = (obj: object): boolean => Object.values(obj).some((v) => v !== null && v !== undefined);

/**
 * Shows batting and bowling stats as independently toggleable sections —
 * some owners only care about one skill even for an all-rounder, so each
 * section can be collapsed on its own. A skill with no data at all (e.g.
 * a pure batsman's bowling numbers) never shows a toggle for it — nothing
 * to hide/show.
 */
export function CricIQStatsPanel({ batting, bowling, variant = "full" }: Props) {
  const battingHasData = hasAny(batting);
  const bowlingHasData = hasAny(bowling);
  const [showBatting, setShowBatting] = useState(true);
  const [showBowling, setShowBowling] = useState(true);

  if (!battingHasData && !bowlingHasData) return null;

  const Toggle = ({
    active,
    onClick,
    label,
    icon,
  }: {
    active: boolean;
    onClick: () => void;
    label: string;
    icon: string;
  }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
        active
          ? "bg-[var(--brand)] text-white border-[var(--brand)]"
          : "bg-white text-[var(--ink-soft)] border-[var(--line)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
      }`}
    >
      {active ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      {icon} {label}
    </button>
  );

  if (variant === "compact") {
    return (
      <div>
        {battingHasData && bowlingHasData && (
          <div className="flex gap-1.5 mb-2">
            <Toggle active={showBatting} onClick={() => setShowBatting((v) => !v)} label="Batting" icon="🏏" />
            <Toggle active={showBowling} onClick={() => setShowBowling((v) => !v)} label="Bowling" icon="🎯" />
          </div>
        )}
        {battingHasData && showBatting && (
          <div className="flex gap-3 text-xs font-mono text-[var(--ink-soft)] flex-wrap">
            {batting.runs !== null && <span>{batting.runs} runs</span>}
            {batting.battingAvg !== null && <span>Avg {batting.battingAvg}</span>}
            {batting.strikeRate !== null && <span>SR {batting.strikeRate}</span>}
            {batting.highestScore !== null && <span>HS {batting.highestScore}</span>}
          </div>
        )}
        {bowlingHasData && showBowling && (
          <div className="flex gap-3 text-xs font-mono text-[var(--ink-soft)] flex-wrap mt-1">
            {bowling.wickets !== null && <span>{bowling.wickets} wkts</span>}
            {bowling.economy !== null && <span>Econ {bowling.economy}</span>}
            {bowling.bowlingAvg !== null && <span>Avg {bowling.bowlingAvg}</span>}
            {bowling.bowlingSr !== null && <span>SR {bowling.bowlingSr}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {battingHasData && (
          <Toggle active={showBatting} onClick={() => setShowBatting((v) => !v)} label="Batting" icon="🏏" />
        )}
        {bowlingHasData && (
          <Toggle active={showBowling} onClick={() => setShowBowling((v) => !v)} label="Bowling" icon="🎯" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {battingHasData && showBatting && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1.5">Batting</div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs font-mono text-[var(--ink-soft)]">
              <Stat label="Runs" value={batting.runs} />
              <Stat label="Inns" value={batting.innings} />
              <Stat label="NO" value={batting.notOuts} />
              <Stat label="Avg" value={batting.battingAvg} />
              <Stat label="SR" value={batting.strikeRate} />
              <Stat label="HS" value={batting.highestScore} />
              <Stat label="50s" value={batting.fifties} />
              <Stat label="100s" value={batting.hundreds} />
              <Stat label="4s" value={batting.fours} />
              <Stat label="6s" value={batting.sixes} />
              <Stat label="Ducks" value={batting.ducks} />
              <Stat label="Bdry%" value={batting.boundaryPct} />
            </div>
          </div>
        )}
        {bowlingHasData && showBowling && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1.5">Bowling</div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs font-mono text-[var(--ink-soft)]">
              <Stat label="Wkts" value={bowling.wickets} />
              <Stat label="Overs" value={bowling.overs} />
              <Stat label="Maidens" value={bowling.maidens} />
              <Stat label="Econ" value={bowling.economy} />
              <Stat label="Avg" value={bowling.bowlingAvg} />
              <Stat label="SR" value={bowling.bowlingSr} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span className="text-[var(--ink-faint)]">{label}</span> <span className="font-semibold">{value ?? "—"}</span>
    </div>
  );
}
