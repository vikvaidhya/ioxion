"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveAuction } from "@/lib/hooks/useLiveAuction";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { openNextLotAction, resolveLotAction, voidBidAction } from "./actions";
import { Gavel, Play, CheckCircle2, XCircle, Ban, Shield } from "lucide-react";

interface Props {
  auction: { id: string; name: string; status: string; public_link_token: string };
  ruleset: any;
  teams: { id: string; name: string; purse_remaining: number }[];
  initialLots: any[];
  orgName: string;
}

export function AuctioneerConsole({ auction, ruleset, teams: initialTeams, initialLots, orgName }: Props) {
  const { openLot, bids, highBid } = useLiveAuction(auction.id);
  const secondsLeft = useCountdown(openLot?.closes_at ?? null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [player, setPlayer] = useState<{ full_name: string; category: string; base_price: number } | null>(null);
  const [lots, setLots] = useState(initialLots);
  const [teams, setTeams] = useState(initialTeams);
  const supabase = createClient();

  const symbol = ruleset?.currency_symbol ?? "₹";
  const fmt = (n: number) => `${symbol}${n.toLocaleString("en-IN")}`;

  // Keep team purses current: refetch whenever any lot resolves, PLUS a
  // 4-second poll as a safety net so this never silently goes stale even
  // if a specific realtime event is missed.
  useEffect(() => {
    const refetchTeams = async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, purse_remaining")
        .eq("auction_id", auction.id);
      if (data) setTeams(data);
    };

    refetchTeams();

    const channel = supabase
      .channel(`auction:${auction.id}:teams`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `auction_id=eq.${auction.id}` },
        refetchTeams
      )
      .subscribe();

    const pollInterval = setInterval(refetchTeams, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [auction.id, supabase]);

  useEffect(() => {
    if (!openLot) {
      setPlayer(null);
      return;
    }
    supabase
      .from("auction_players")
      .select("category, base_price, players(full_name)")
      .eq("id", openLot.auction_player_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPlayer({
            // @ts-expect-error nested select typing
            full_name: data.players?.full_name ?? "Unknown",
            category: data.category,
            base_price: data.base_price,
          });
        }
      });
  }, [openLot, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`auction:${auction.id}:lots-list`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `auction_id=eq.${auction.id}` },
        async () => {
          const { data } = await supabase
            .from("lots")
            .select("id, sequence_number, status, auction_player_id, closes_at")
            .eq("auction_id", auction.id)
            .order("sequence_number");
          setLots(data ?? []);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [auction.id, supabase]);

  const queuedCount = lots.filter((l) => l.status === "queued").length;
  const soldCount = lots.filter((l) => l.status === "sold").length;
  const unsoldCount = lots.filter((l) => l.status === "unsold").length;

  const handleOpenNext = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await openNextLotAction(auction.id);
      if (result?.error) setMessage(result.error);
    });
  };

  const handleResolve = () => {
    if (!openLot) return;
    setMessage(null);
    startTransition(async () => {
      const result = await resolveLotAction(openLot.id);
      // "Lot is not open" here just means the pg_cron safety-net job (or a
      // race with this same auto-trigger) already resolved it first —
      // not a real error, so don't surface it as one.
      if (result?.error && result.error !== "Lot is not open.") setMessage(result.error);
    });
  };

  // Auto-resolve the instant the countdown hits zero — the Auctioneer no
  // longer has to click in time. This is a fast-path for UX; the pg_cron
  // job in the database is the real safety net if no one's browser is open
  // at all when a lot expires.
  const autoResolvedRef = useState(() => new Set<string>())[0];
  useEffect(() => {
    if (!openLot || secondsLeft !== 0) return;
    if (autoResolvedRef.has(openLot.id)) return;
    autoResolvedRef.add(openLot.id);
    startTransition(async () => {
      await resolveLotAction(openLot.id);
    });
  }, [openLot, secondsLeft, autoResolvedRef]);

  const handleVoid = (bidId: string) => {
    startTransition(async () => {
      await voidBidAction(bidId, "Auctioneer override");
    });
  };

  const timerExpired = openLot && secondsLeft === 0;

  return (
    <div className="min-h-screen bg-[#F6F4EF]">
      <div className="border-b border-[#DBD5C7] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="text-[#1B4332]" size={20} />
            <span className="font-semibold">iOxion</span>
            <span className="text-[#8A8372] text-sm">/ Auctioneer Console</span>
            <span className="text-[#B5AF9F] text-xs">· {orgName}</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-[#8A8372]">
            <span>{queuedCount} queued</span>
            <span>·</span>
            <span>{soldCount} sold</span>
            <span>·</span>
            <span>{unsoldCount} unsold</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-[#DBD5C7] rounded-xl overflow-hidden">
            {!openLot || !player ? (
              <div className="p-10 text-center">
                <p className="text-[#8A8372] mb-4">No lot currently open.</p>
                <button
                  onClick={handleOpenNext}
                  disabled={isPending || queuedCount === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#1B4332] text-white font-semibold text-sm hover:bg-[#153726] disabled:opacity-40 transition-colors"
                >
                  <Play size={15} /> Open next lot
                </button>
                {queuedCount === 0 && (
                  <p className="text-xs text-[#B5AF9F] mt-2">All lots have been processed.</p>
                )}
              </div>
            ) : (
              <>
                <div className="px-6 py-5 border-b border-[#EFEADD] flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[#8A8372] font-semibold mb-1">
                      {player.category} · Lot #{openLot.sequence_number}
                    </div>
                    <h1 className="text-xl font-semibold">{player.full_name}</h1>
                  </div>
                  <div
                    className={`font-mono text-2xl font-bold ${
                      secondsLeft !== null && secondsLeft <= 3 ? "text-[#7A2E2E]" : "text-[#5C5646]"
                    }`}
                  >
                    {secondsLeft ?? "—"}s
                  </div>
                </div>
                <div className="px-6 py-5 border-b border-[#EFEADD] text-center">
                  <div className="text-xs uppercase tracking-wide text-[#8A8372] font-semibold mb-1">
                    Current bid
                  </div>
                  <div className="text-3xl font-bold font-mono text-[#1B4332]">
                    {fmt(highBid?.amount ?? player.base_price)}
                  </div>
                  {highBid && (
                    <div className="text-xs text-[#8A8372] mt-1">
                      {teams.find((t) => t.id === highBid.team_id)?.name ?? "Unknown team"}
                    </div>
                  )}
                </div>
                <div className="p-4 flex gap-2">
                  <button
                    onClick={handleResolve}
                    disabled={isPending || !timerExpired}
                    className="flex-1 py-3 rounded-md bg-[#1B4332] text-white font-semibold text-sm hover:bg-[#153726] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={15} />
                    {highBid ? "Mark sold now" : "Mark unsold now"}
                  </button>
                </div>
                {!timerExpired ? (
                  <p className="text-xs text-center text-[#B5AF9F] pb-4">
                    Resolves automatically when the timer expires.
                  </p>
                ) : (
                  <p className="text-xs text-center text-[#B5AF9F] pb-4">
                    Resolving automatically…
                  </p>
                )}
              </>
            )}
          </div>

          {bids.length > 0 && (
            <div className="bg-white border border-[#DBD5C7] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EFEADD] text-xs uppercase tracking-wide text-[#8A8372] font-semibold">
                Bids on this lot — admin override
              </div>
              <div className="divide-y divide-[#F6F4EF]">
                {bids.map((b) => (
                  <div key={b.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className={b.is_voided ? "line-through text-[#B5AF9F]" : ""}>
                      {teams.find((t) => t.id === b.team_id)?.name} — {fmt(b.amount)}
                    </span>
                    {!b.is_voided && (
                      <button
                        onClick={() => handleVoid(b.id)}
                        className="text-xs text-[#7A2E2E] hover:underline flex items-center gap-1"
                      >
                        <Ban size={12} /> Void
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {message && (
            <div className="text-sm text-[#7A2E2E] bg-white border border-[#DBD5C7] rounded-lg px-4 py-3">
              {message}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-[#8A8372] font-semibold px-1">Teams</div>
          {teams.map((t) => (
            <div key={t.id} className="bg-white border border-[#DBD5C7] rounded-lg p-3 flex items-center gap-2">
              <Shield size={14} className="text-[#1B4332]" />
              <div>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs font-mono text-[#8A8372]">{fmt(t.purse_remaining)}</div>
              </div>
            </div>
          ))}
          <a
            href={`/live/${auction.public_link_token}`}
            target="_blank"
            className="block text-center text-xs font-medium text-[#1B4332] hover:underline pt-2"
          >
            View public live link →
          </a>
        </div>
      </div>
    </div>
  );
}
