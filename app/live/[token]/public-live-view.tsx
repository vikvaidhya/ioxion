"use client";

import { useEffect, useState } from "react";
import { Gavel, Shield, Trophy } from "lucide-react";

interface Props {
  auction: { id: string; name: string; status: string };
  ruleset: { currency_symbol: string; currency_name: string; currency_type: string } | null;
  teams: { id: string; name: string; purse_remaining: number }[];
}

interface LiveState {
  auction: { name: string; status: string };
  openLot: { sequenceNumber: number; closesAt: string | null } | null;
  player: { fullName: string; category: string; basePrice: number } | null;
  highBid: { amount: number; teamName: string } | null;
  soldCount: number;
}

export function PublicLiveView({ auction, ruleset, teams }: Props) {
  const [state, setState] = useState<LiveState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const symbol = ruleset?.currency_symbol ?? "₹";
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-IN")}`;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/live/${window.location.pathname.split("/").pop()}`);
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch {
        // Transient network error — next poll will retry.
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!state?.openLot?.closesAt) {
      setSecondsLeft(null);
      return;
    }
    const target = new Date(state.openLot.closesAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state?.openLot?.closesAt]);

  return (
    <div className="min-h-screen bg-[#111310] text-white">
      <div className="border-b border-white/10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel size={18} className="text-[#8FBF9F]" />
            <span className="font-semibold">{auction.name}</span>
          </div>
          <span className="text-xs uppercase tracking-wide text-white/50">Live</span>
        </div>
      </div>

      {ruleset?.currency_type === "custom" && (
        <div className="bg-[#3B3220] text-[#E8D9A8] text-xs text-center py-2 px-4">
          This auction uses play currency ({ruleset.currency_name}) — no real money changes hands.
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-10">
        {!state?.player ? (
          <div className="text-center py-24 text-white/40">Waiting for the next player…</div>
        ) : (
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-white/40 font-semibold mb-2">
              {state.player.category} · Lot #{state.openLot?.sequenceNumber}
            </div>
            <h1 className="text-4xl font-semibold mb-8" style={{ fontFamily: "Georgia, serif" }}>
              {state.player.fullName}
            </h1>

            <div className="text-6xl font-bold font-mono text-[#8FBF9F] mb-2">
              {fmt(state.highBid?.amount ?? state.player.basePrice)}
            </div>
            {state.highBid && <div className="text-white/60 mb-8">{state.highBid.teamName} leads</div>}

            {secondsLeft !== null && (
              <div
                className={`inline-block font-mono text-2xl font-bold px-4 py-1.5 rounded-full ${
                  secondsLeft <= 3 ? "bg-[#5C2222] text-[#F0B8B8]" : "bg-white/10"
                }`}
              >
                {secondsLeft}s
              </div>
            )}
          </div>
        )}

        <div className="mt-16 grid grid-cols-2 gap-3">
          {teams.map((t) => (
            <div key={t.id} className="border border-white/10 rounded-lg p-3 flex items-center gap-2">
              <Shield size={14} className="text-[#8FBF9F]" />
              <span className="text-sm">{t.name}</span>
            </div>
          ))}
        </div>

        {state && (
          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/40">
            <Trophy size={12} /> {state.soldCount} players sold so far
          </div>
        )}
      </div>
    </div>
  );
}
