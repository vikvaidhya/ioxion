"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveAuction } from "@/lib/hooks/useLiveAuction";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { placeBidAction } from "./actions";
import { nextValidBid, maxPossibleBid, type Category } from "@/lib/auction/rules";
import { Gavel, Wallet, Users, Timer, TrendingUp, Sparkles, Volume2, VolumeX } from "lucide-react";
import { CricIQStatsPanel } from "@/components/criciq-stats-panel";
import { RoleScoreBadge } from "@/components/role-score-badge";
import { useAuctionSoundEffects } from "@/lib/hooks/useAuctionSoundEffects";
import { useAuctionStatus } from "@/lib/hooks/useAuctionStatus";

interface Props {
  team: { id: string; name: string; purse_remaining: number; auction_id: string };
  ruleset: any;
  squadCount: number;
  userId: string;
  orgName: string;
}

interface PlayerInfo {
  id: string;
  full_name: string;
  category: string;
  base_price: number;
  playerId: string;
}

interface CricIQInfo {
  persona: string | null;
  primary_role: string | null;
  summary_text: string | null;
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
  roleBasis: string | null;
  battingScore: number | null;
  bowlingScore: number | null;
  performanceScore: number | null;
}

export function OwnerBiddingRoom({ team: initialTeam, ruleset, squadCount: initialSquadCount, userId, orgName }: Props) {
  const [team, setTeam] = useState(initialTeam);
  const [squadCount, setSquadCount] = useState(initialSquadCount);
  const { openLot, bids, highBid } = useLiveAuction(team.auction_id);
  const secondsLeft = useCountdown(openLot?.closes_at ?? null);
  const [justResolved, setJustResolved] = useState<"sold" | "unsold" | null>(null);
  const prevOpenLot = useRef<{ id: string; hadBid: boolean } | null>(null);

  useEffect(() => {
    if (openLot === null && prevOpenLot.current) {
      setJustResolved(prevOpenLot.current.hadBid ? "sold" : "unsold");
      setTimeout(() => setJustResolved(null), 2000);
      prevOpenLot.current = null;
    } else if (openLot) {
      prevOpenLot.current = { id: openLot.id, hadBid: !!highBid };
    }
  }, [openLot, highBid]);

  const { soundOn, toggleSound } = useAuctionSoundEffects({
    lotId: openLot?.id ?? null,
    highBidAmount: highBid?.amount ?? null,
    secondsLeft,
    soldJustNow: justResolved === "sold",
    unsoldJustNow: justResolved === "unsold",
  });
  const auctionStatus = useAuctionStatus(team.auction_id);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [criciq, setCriciq] = useState<CricIQInfo | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  // Refetch this owner's purse + squad count whenever ANY lot on this
  // auction changes status (i.e. a sale/unsold just resolved somewhere),
  // AND on a 4-second poll as a safety net. The realtime subscription alone
  // can occasionally miss an event (network blip, tab backgrounded, etc.),
  // so the poll guarantees these numbers self-correct within a few seconds
  // no matter what — important since a stale purse/squad count could let
  // an owner believe they can bid more than they actually can.
  useEffect(() => {
    const refetchTeamState = async () => {
      const { data: freshTeam } = await supabase
        .from("teams")
        .select("id, name, purse_remaining, auction_id")
        .eq("id", team.id)
        .single();
      if (freshTeam) setTeam(freshTeam);

      const { count } = await supabase
        .from("auction_players")
        .select("id", { count: "exact", head: true })
        .eq("auction_id", team.auction_id)
        .eq("sold_to_team_id", team.id);
      setSquadCount(count ?? 0);
    };

    refetchTeamState(); // once immediately on mount

    const channel = supabase
      .channel(`owner:${team.id}:squad-purse`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `auction_id=eq.${team.auction_id}` },
        refetchTeamState
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_players", filter: `auction_id=eq.${team.auction_id}` },
        refetchTeamState
      )
      .subscribe();

    const pollInterval = setInterval(refetchTeamState, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [team.id, team.auction_id, supabase]);

  useEffect(() => {
    if (!openLot) {
      setPlayer(null);
      setCriciq(null);
      return;
    }
    supabase
      .from("auction_players")
      .select("id, category, base_price, player_id, players(full_name)")
      .eq("id", openLot.auction_player_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPlayer({
            id: data.id,
            // @ts-expect-error nested select typing
            full_name: data.players?.full_name ?? "Unknown",
            category: data.category,
            base_price: data.base_price,
            playerId: data.player_id,
          });

          // Latest CricIQ insight for this player, if one's been uploaded —
          // shown right where the owner is deciding whether to bid.
          supabase
            .from("criciq_snapshots")
            .select(
              "persona, primary_role, summary_text, runs, innings, not_outs, batting_avg, strike_rate, highest_score, fifties, hundreds, fours, sixes, ducks, boundary_pct, wickets, overs, maidens, economy, bowling_avg, bowling_sr, role_basis, batting_score, bowling_score, performance_score"
            )
            .eq("player_id", data.player_id)
            .order("synced_at", { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data: criciqData }) => {
              if (criciqData) {
                setCriciq({
                  persona: criciqData.persona,
                  primary_role: criciqData.primary_role,
                  summary_text: criciqData.summary_text,
                  runs: criciqData.runs,
                  innings: criciqData.innings,
                  notOuts: criciqData.not_outs,
                  battingAvg: criciqData.batting_avg,
                  strikeRate: criciqData.strike_rate,
                  highestScore: criciqData.highest_score,
                  fifties: criciqData.fifties,
                  hundreds: criciqData.hundreds,
                  fours: criciqData.fours,
                  sixes: criciqData.sixes,
                  ducks: criciqData.ducks,
                  boundaryPct: criciqData.boundary_pct,
                  wickets: criciqData.wickets,
                  overs: criciqData.overs,
                  maidens: criciqData.maidens,
                  economy: criciqData.economy,
                  bowlingAvg: criciqData.bowling_avg,
                  bowlingSr: criciqData.bowling_sr,
                  roleBasis: criciqData.role_basis,
                  battingScore: criciqData.batting_score,
                  bowlingScore: criciqData.bowling_score,
                  performanceScore: criciqData.performance_score,
                });
              } else {
                setCriciq(null);
              }
            });
        }
      });
  }, [openLot, supabase]);

  const category: Category | undefined = ruleset?.categories?.find(
    (c: Category) => c.name === player?.category
  );

  const currentAmount = highBid?.amount ?? player?.base_price ?? 0;
  const nextBid = category ? nextValidBid(currentAmount, category) : currentAmount;
  const cap = maxPossibleBid({
    purseRemaining: team.purse_remaining,
    currentSquadSize: squadCount,
    minSquadSize: ruleset?.min_squad_size ?? 0,
    cheapestRemainingBasePrice: player?.base_price ?? 0,
  });

  const symbol = ruleset?.currency_symbol ?? "₹";
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-IN")}`;

  const handleBid = () => {
    if (!openLot) return;
    setError(null);
    startTransition(async () => {
      const result = await placeBidAction(openLot.id, team.id, nextBid);
      if (result?.error) setError(result.error);
    });
  };

  const isMyTeamHighBidder = highBid?.team_id === team.id;
  const canBid = openLot?.status === "open" && (secondsLeft ?? 0) > 0 && nextBid <= cap && !isMyTeamHighBidder && auctionStatus !== "paused";

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="border-b border-[var(--line)] bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="text-[var(--brand)]" size={18} />
            <span className="font-semibold">{team.name}</span>
            <span className="text-[var(--ink-faint)] text-xs">· {orgName}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-[var(--ink-soft)]">
              <Wallet size={14} />
              <span className="font-mono">{fmt(team.purse_remaining)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--ink-soft)]">
              <Users size={14} />
              <span className="font-mono">{squadCount}/{ruleset?.max_squad_size}</span>
            </div>
            <button
              onClick={toggleSound}
              className="p-1.5 rounded-full border border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--brand)] hover:border-[var(--brand)] transition-colors"
              title={soundOn ? "Mute sound effects" : "Enable sound effects"}
            >
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
          </div>
        </div>
        <div
          className="h-1"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--brand-soft) 20%, var(--brand-soft) 80%, transparent)",
          }}
        />
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {auctionStatus === "paused" && (
          <div className="text-center py-2.5 mb-4 rounded-lg bg-[var(--warning-soft)] text-[var(--warning)] text-sm font-semibold">
            Bidding is paused by the Auctioneer
          </div>
        )}
        {justResolved && (
          <div
            className={`text-center py-3 mb-4 rounded-lg font-display font-semibold text-lg tracking-wide ${
              justResolved === "sold" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"
            }`}
          >
            {justResolved === "sold" ? "SOLD!" : "UNSOLD"}
          </div>
        )}
        {!openLot || !player ? (
          <div className="text-center py-24 text-[var(--ink-soft)]">
            <Gavel size={32} className="mx-auto mb-3 opacity-40" />
            Waiting for the next player to go up for auction…
          </div>
        ) : (
          <div className="bg-white border border-[var(--line)] rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--brand-soft)] text-center">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">
                {player.category} · Lot #{openLot.sequence_number}
              </div>
              <h1 className="font-display text-2xl font-semibold">
                {player.full_name}
              </h1>
            </div>

            {criciq && (
              <div className="px-6 py-4 border-b border-[var(--brand-soft)] bg-[var(--paper)]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={13} className="text-[var(--brand)]" />
                  <span className="text-xs font-semibold text-[var(--brand)]">
                    {criciq.persona || "CricIQ Insight"}
                  </span>
                </div>
                <div className="mb-2">
                  <RoleScoreBadge
                    primaryRole={criciq.primary_role}
                    battingScore={criciq.battingScore}
                    bowlingScore={criciq.bowlingScore}
                  />
                </div>
                <CricIQStatsPanel
                  variant="compact"
                  batting={{
                    runs: criciq.runs,
                    innings: criciq.innings,
                    notOuts: criciq.notOuts,
                    battingAvg: criciq.battingAvg,
                    strikeRate: criciq.strikeRate,
                    highestScore: criciq.highestScore,
                    fifties: criciq.fifties,
                    hundreds: criciq.hundreds,
                    fours: criciq.fours,
                    sixes: criciq.sixes,
                    ducks: criciq.ducks,
                    boundaryPct: criciq.boundaryPct,
                  }}
                  bowling={{
                    wickets: criciq.wickets,
                    overs: criciq.overs,
                    maidens: criciq.maidens,
                    economy: criciq.economy,
                    bowlingAvg: criciq.bowlingAvg,
                    bowlingSr: criciq.bowlingSr,
                  }}
                />
                {criciq.summary_text && (
                  <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-2">{criciq.summary_text}</p>
                )}
              </div>
            )}

            <div className="px-6 py-6 text-center border-b border-[var(--brand-soft)]">
              <div className="text-xs uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1">
                Current bid
              </div>
              <div className="text-4xl font-bold font-mono text-[var(--brand)]">{fmt(currentAmount)}</div>
              {highBid && (
                <div className="text-xs text-[var(--ink-soft)] mt-1">
                  {isMyTeamHighBidder ? "You're the highest bidder" : "Another team leads"}
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex items-center justify-center gap-2 border-b border-[var(--brand-soft)]">
              <Timer size={16} className={secondsLeft && secondsLeft <= 3 ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"} />
              <span
                className={`font-mono text-lg font-semibold ${
                  secondsLeft && secondsLeft <= 3 ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"
                }`}
              >
                {auctionStatus === "paused" ? "Paused" : `${secondsLeft ?? "—"}s`}
              </span>
            </div>

            <div className="p-6">
              <button
                onClick={handleBid}
                disabled={!canBid || isPending}
                className="w-full py-4 rounded-lg bg-[var(--brand)] text-white font-semibold text-lg hover:bg-[var(--brand-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <TrendingUp size={18} />
                {isPending
                  ? "Placing bid…"
                  : auctionStatus === "paused"
                  ? "Bidding paused"
                  : isMyTeamHighBidder
                  ? "You're leading"
                  : `Bid ${fmt(nextBid)}`}
              </button>
              {nextBid > cap && !isMyTeamHighBidder && (
                <p className="text-xs text-[var(--danger)] mt-2 text-center">
                  Next bid exceeds your max possible bid ({fmt(cap)}) given remaining squad slots.
                </p>
              )}
              {error && <p className="text-sm text-[var(--danger)] mt-2 text-center">{error}</p>}
            </div>
          </div>
        )}

        {bids.length > 0 && (
          <div className="mt-6 bg-white border border-[var(--line)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--brand-soft)] text-xs uppercase tracking-wide text-[var(--ink-soft)] font-semibold">
              Bid history
            </div>
            <div className="divide-y divide-[var(--paper)]">
              {bids.map((b) => (
                <div key={b.id} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className={b.is_voided ? "line-through text-[var(--ink-faint)]" : ""}>
                    {b.team_id === team.id ? team.name : "Other team"}
                  </span>
                  <span className="font-mono">{fmt(b.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
