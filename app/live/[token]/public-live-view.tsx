"use client";

import { useEffect, useRef, useState } from "react";
import { Gavel, Shield, Trophy, Volume2, VolumeX } from "lucide-react";
import { RoleScoreBadge } from "@/components/role-score-badge";
import { StadiumBackground } from "@/components/stadium-background";
import { useAuctionSoundEffects } from "@/lib/hooks/useAuctionSoundEffects";

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
  criciq: { primaryRole: string | null; battingScore: number | null; bowlingScore: number | null } | null;
  soldCount: number;
}

export function PublicLiveView({ auction, ruleset, teams }: Props) {
  const [state, setState] = useState<LiveState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [justSold, setJustSold] = useState(false);
  const prevSoldCount = useRef<number | null>(null);
  const symbol = ruleset?.currency_symbol ?? "₹";
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-IN")}`;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/live/${window.location.pathname.split("/").pop()}`);
        const data: LiveState = await res.json();
        if (cancelled) return;

        if (prevSoldCount.current !== null && data.soldCount > prevSoldCount.current) {
          setJustSold(true);
          setTimeout(() => setJustSold(false), 2500);
        }
        prevSoldCount.current = data.soldCount;
        setState(data);
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

  const { soundOn, toggleSound } = useAuctionSoundEffects({
    lotId: state?.openLot ? String(state.openLot.sequenceNumber) : null,
    highBidAmount: state?.highBid?.amount ?? null,
    secondsLeft,
    soldJustNow: justSold,
    unsoldJustNow: false,
  });

  return (
    <div className="min-h-screen bg-[#0d1712] text-white relative">
      <StadiumBackground />

      <div className="relative border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel size={18} className="text-[#8FBF9F]" />
            <span className="font-display font-semibold">{auction.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSound}
              className="p-1.5 rounded-full border border-white/15 text-white/60 hover:text-white hover:border-white/40 transition-colors"
              title={soundOn ? "Mute sound effects" : "Enable sound effects"}
            >
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
            <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B5461B] animate-pulse" />
              Live
            </span>
          </div>
        </div>
      </div>

      {ruleset?.currency_type === "custom" && (
        <div className="relative bg-[#3B3220] text-[#E8D9A8] text-xs text-center py-2 px-4">
          This auction uses play currency ({ruleset.currency_name}) — no real money changes hands.
        </div>
      )}

      {state?.auction.status === "paused" && (
        <div className="relative bg-[#5C4A22] text-[#E8D9A8] text-xs font-semibold text-center py-2 px-4">
          Bidding is currently paused
        </div>
      )}

      <div className="relative max-w-2xl mx-auto px-6 py-10">
        {!state?.player ? (
          <div className="text-center py-24 text-white/40">Waiting for the next player…</div>
        ) : (
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-white/40 font-semibold mb-2">
              {state.player.category} · Lot #{state.openLot?.sequenceNumber}
            </div>
            <h1 className="font-display text-4xl font-semibold mb-3">{state.player.fullName}</h1>

            {state.criciq && (
              <div className="flex justify-center mb-6">
                <RoleScoreBadge
                  primaryRole={state.criciq.primaryRole}
                  battingScore={state.criciq.battingScore}
                  bowlingScore={state.criciq.bowlingScore}
                />
              </div>
            )}

            {/* Scoreboard panel */}
            <div
              className={`inline-block rounded-2xl border px-10 py-6 transition-all duration-500 ${
                justSold ? "border-[#8FBF9F] shadow-[0_0_40px_rgba(143,191,159,0.35)]" : "border-white/10"
              }`}
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))" }}
            >
              {justSold && (
                <div className="text-xs font-bold tracking-[0.3em] text-[#8FBF9F] mb-1 animate-pulse">SOLD!</div>
              )}
              <div className="text-6xl font-bold font-mono text-[#8FBF9F] tabular-nums">
                {fmt(state.highBid?.amount ?? state.player.basePrice)}
              </div>
              {state.highBid && <div className="text-white/60 mt-1 text-sm">{state.highBid.teamName} leads</div>}
            </div>

            {secondsLeft !== null && (
              <div className="mt-6">
                <div
                  className={`inline-block font-mono text-2xl font-bold px-5 py-2 rounded-full transition-colors ${
                    secondsLeft <= 3 ? "bg-[#5C2222] text-[#F0B8B8]" : "bg-white/10"
                  }`}
                >
                  {secondsLeft}s
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-16 grid grid-cols-2 gap-3">
          {teams.map((t) => (
            <div key={t.id} className="border border-white/10 rounded-lg p-3 flex items-center gap-2 bg-white/[0.02]">
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
