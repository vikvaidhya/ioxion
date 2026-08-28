"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface LiveLot {
  id: string;
  auction_id: string;
  auction_player_id: string;
  sequence_number: number;
  status: "queued" | "open" | "closing" | "sold" | "unsold";
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  version: number;
}

export interface LiveBid {
  id: string;
  lot_id: string;
  team_id: string;
  amount: number;
  placed_by: string;
  placed_at: string;
  is_voided: boolean;
}

/**
 * Subscribes to the currently-open lot and its bids for an auction, via
 * Supabase Realtime (Postgres change feed) — no separate publish step:
 * any insert/update from a server action is broadcast automatically.
 * Falls back to an initial fetch so the UI isn't empty before the first
 * realtime event arrives.
 */
export function useLiveAuction(auctionId: string) {
  const [openLot, setOpenLot] = useState<LiveLot | null>(null);
  const [bids, setBids] = useState<LiveBid[]>([]);
  const supabase = createClient();

  const refetchOpenLot = useCallback(async () => {
    const { data } = await supabase
      .from("lots")
      .select("*")
      .eq("auction_id", auctionId)
      .eq("status", "open")
      .maybeSingle();
    setOpenLot(data as LiveLot | null);
  }, [auctionId, supabase]);

  const refetchBids = useCallback(
    async (lotId: string) => {
      const { data } = await supabase
        .from("bids")
        .select("*")
        .eq("lot_id", lotId)
        .order("amount", { ascending: false });
      setBids((data as LiveBid[]) ?? []);
    },
    [supabase]
  );

  useEffect(() => {
    refetchOpenLot();

    const lotsChannel = supabase
      .channel(`auction:${auctionId}:lots`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lots", filter: `auction_id=eq.${auctionId}` },
        () => refetchOpenLot()
      )
      .subscribe();

    // Poll every 3s as a safety net alongside realtime — bidding is the
    // highest-stakes live surface in the app, so we don't want it to ever
    // depend on a single event type or channel arriving reliably.
    const pollInterval = setInterval(refetchOpenLot, 3000);

    return () => {
      supabase.removeChannel(lotsChannel);
      clearInterval(pollInterval);
    };
  }, [auctionId, refetchOpenLot, supabase]);

  useEffect(() => {
    if (!openLot) {
      setBids([]);
      return;
    }
    refetchBids(openLot.id);

    const bidsChannel = supabase
      .channel(`lot:${openLot.id}:bids`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `lot_id=eq.${openLot.id}` },
        () => refetchBids(openLot.id)
      )
      .subscribe();

    const pollInterval = setInterval(() => refetchBids(openLot.id), 3000);

    return () => {
      supabase.removeChannel(bidsChannel);
      clearInterval(pollInterval);
    };
  }, [openLot, refetchBids, supabase]);

  return { openLot, bids, highBid: bids.find((b) => !b.is_voided) ?? null };
}
