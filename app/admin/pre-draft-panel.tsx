"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retainPlayerAction, unretainPlayerAction } from "./setup-actions";
import { Star, X, ChevronDown } from "lucide-react";

interface Player {
  id: string;
  full_name: string;
  is_overseas: boolean;
}

interface PendingAuctionPlayer {
  player_id: string;
  category: string;
}

interface RetainedAuctionPlayer {
  player_id: string;
  sold_to_team_id: string;
  sold_price: number;
}

interface Team {
  id: string;
  name: string;
}

interface Props {
  auctionId: string;
  auctionLocked: boolean;
  pendingPlayers: (Player & PendingAuctionPlayer)[];
  retainedPlayers: (Player & RetainedAuctionPlayer)[];
  teams: Team[];
  maxRetentionsPerTeam: number;
  currencySymbol: string;
}

export function PreDraftPanel({
  auctionId,
  auctionLocked,
  pendingPlayers,
  retainedPlayers,
  teams,
  maxRetentionsPerTeam,
  currencySymbol,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id ?? "");
  const [price, setPrice] = useState<number | "">("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const retainedCountByTeam = new Map<string, number>();
  for (const p of retainedPlayers) {
    retainedCountByTeam.set(p.sold_to_team_id, (retainedCountByTeam.get(p.sold_to_team_id) ?? 0) + 1);
  }

  const handleRetain = () => {
    setError(null);
    if (!selectedPlayerId || !selectedTeamId || price === "") {
      setError("Pick a player, a team, and enter a price.");
      return;
    }
    startTransition(async () => {
      const result = await retainPlayerAction({
        auctionId,
        playerId: selectedPlayerId,
        teamId: selectedTeamId,
        price: Number(price),
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSelectedPlayerId("");
        setPrice("");
        router.refresh();
      }
    });
  };

  const handleUnretain = (playerId: string) => {
    startTransition(async () => {
      const result = await unretainPlayerAction(auctionId, playerId);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  if (maxRetentionsPerTeam === 0 && retainedPlayers.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-[var(--line)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-[var(--paper)] transition-colors"
      >
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Star size={16} className="text-[var(--brand)]" />
          Pre-draft retentions ({retainedPlayers.length})
        </h2>
        <ChevronDown size={16} className={`text-[var(--ink-faint)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--line)] p-5 space-y-4">
          {auctionLocked && (
            <p className="text-xs text-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 rounded">
              Auction is live — retentions are locked and can no longer be changed.
            </p>
          )}

          {retainedPlayers.length > 0 && (
            <div className="space-y-1.5">
              {retainedPlayers.map((p) => {
                const team = teams.find((t) => t.id === p.sold_to_team_id);
                return (
                  <div key={p.player_id} className="flex items-center justify-between text-sm bg-[var(--brand-soft)] px-3 py-2 rounded">
                    <span>
                      <strong>{p.full_name}</strong>
                      {p.is_overseas && <span className="text-[10px] text-[var(--ink-faint)] ml-1">(overseas)</span>}
                      {" → "}
                      {team?.name ?? "Unknown team"}
                      <span className="font-mono text-xs text-[var(--ink-soft)] ml-2">
                        {currencySymbol}
                        {p.sold_price.toLocaleString("en-IN")}
                      </span>
                    </span>
                    {!auctionLocked && (
                      <button
                        onClick={() => handleUnretain(p.player_id)}
                        disabled={isPending}
                        className="p-1 text-[var(--ink-faint)] hover:text-[var(--danger)]"
                        title="Un-retain"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!auctionLocked && pendingPlayers.length > 0 && (
            <div className="border-t border-[var(--line)] pt-4">
              <p className="text-xs font-semibold text-[var(--ink-soft)] mb-2">Retain a player</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="px-2 py-1.5 rounded border border-[var(--line)] text-sm flex-1 min-w-[160px]"
                >
                  <option value="">Select player…</option>
                  {pendingPlayers.map((p) => (
                    <option key={p.player_id} value={p.player_id}>
                      {p.full_name} ({p.category})
                    </option>
                  ))}
                </select>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="px-2 py-1.5 rounded border border-[var(--line)] text-sm"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({retainedCountByTeam.get(t.id) ?? 0}/{maxRetentionsPerTeam} used)
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--ink-soft)]">{currencySymbol}</span>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Price"
                    className="w-28 px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
                  />
                </div>
                <button
                  onClick={handleRetain}
                  disabled={isPending}
                  className="px-4 py-1.5 rounded bg-[var(--brand)] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isPending ? "Retaining…" : "Retain"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
