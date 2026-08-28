"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveAuction } from "@/lib/hooks/useLiveAuction";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { placeBidAction } from "./actions";
import { nextValidBid, maxPossibleBid, type Category } from "@/lib/auction/rules";
import { Gavel, Wallet, Users, Timer, TrendingUp } from "lucide-react";

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
}

export function OwnerBiddingRoom({ team: initialTeam, ruleset, squadCount: initialSquadCount, userId, orgName }: Props) {
  const [team, setTeam] = useState(initialTeam);
  const [squadCount, setSquadCount] = useState(initialSquadCount);
  const { openLot, bids, highBid } = useLiveAuction(team.auction_id);
  const secondsLeft = useCountdown(openLot?.closes_at ?? null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
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
      return;
    }
    supabase
      .from("auction_players")
      .select("id, category, base_price, players(full_name)")
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
  const canBid = openLot?.status === "open" && (secondsLeft ?? 0) > 0 && nextBid <= cap && !isMyTeamHighBidder;

  return (
    <div className="min-h-screen bg-[#F6F4EF]">
      <div className="border-b border-[#DBD5C7] bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="text-[#1B4332]" size={18} />
            <span className="font-semibold">{team.name}</span>
            <span className="text-[#B5AF9F] text-xs">· {orgName}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-[#5C5646]">
              <Wallet size={14} />
              <span className="font-mono">{fmt(team.purse_remaining)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#5C5646]">
              <Users size={14} />
              <span className="font-mono">{squadCount}/{ruleset?.max_squad_size}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {!openLot || !player ? (
          <div className="text-center py-24 text-[#8A8372]">
            <Gavel size={32} className="mx-auto mb-3 opacity-40" />
            Waiting for the next player to go up for auction…
          </div>
        ) : (
          <div className="bg-white border border-[#DBD5C7] rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[#EFEADD] text-center">
              <div className="text-xs uppercase tracking-wide text-[#8A8372] font-semibold mb-1">
                {player.category} · Lot #{openLot.sequence_number}
              </div>
              <h1 className="font-display text-2xl font-semibold" style={{ fontFamily: "Georgia, serif" }}>
                {player.full_name}
              </h1>
            </div>

            <div className="px-6 py-6 text-center border-b border-[#EFEADD]">
              <div className="text-xs uppercase tracking-wide text-[#8A8372] font-semibold mb-1">
                Current bid
              </div>
              <div className="text-4xl font-bold font-mono text-[#1B4332]">{fmt(currentAmount)}</div>
              {highBid && (
                <div className="text-xs text-[#8A8372] mt-1">
                  {isMyTeamHighBidder ? "You're the highest bidder" : "Another team leads"}
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex items-center justify-center gap-2 border-b border-[#EFEADD]">
              <Timer size={16} className={secondsLeft && secondsLeft <= 3 ? "text-[#7A2E2E]" : "text-[#8A8372]"} />
              <span
                className={`font-mono text-lg font-semibold ${
                  secondsLeft && secondsLeft <= 3 ? "text-[#7A2E2E]" : "text-[#5C5646]"
                }`}
              >
                {secondsLeft ?? "—"}s
              </span>
            </div>

            <div className="p-6">
              <button
                onClick={handleBid}
                disabled={!canBid || isPending}
                className="w-full py-4 rounded-lg bg-[#1B4332] text-white font-semibold text-lg hover:bg-[#153726] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <TrendingUp size={18} />
                {isPending
                  ? "Placing bid…"
                  : isMyTeamHighBidder
                  ? "You're leading"
                  : `Bid ${fmt(nextBid)}`}
              </button>
              {nextBid > cap && !isMyTeamHighBidder && (
                <p className="text-xs text-[#7A2E2E] mt-2 text-center">
                  Next bid exceeds your max possible bid ({fmt(cap)}) given remaining squad slots.
                </p>
              )}
              {error && <p className="text-sm text-[#7A2E2E] mt-2 text-center">{error}</p>}
            </div>
          </div>
        )}

        {bids.length > 0 && (
          <div className="mt-6 bg-white border border-[#DBD5C7] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EFEADD] text-xs uppercase tracking-wide text-[#8A8372] font-semibold">
              Bid history
            </div>
            <div className="divide-y divide-[#F6F4EF]">
              {bids.map((b) => (
                <div key={b.id} className="px-4 py-2.5 flex justify-between text-sm">
                  <span className={b.is_voided ? "line-through text-[#B5AF9F]" : ""}>
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
