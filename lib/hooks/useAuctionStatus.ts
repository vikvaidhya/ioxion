"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export function useAuctionStatus(auctionId: string, initialStatus?: string) {
  const [status, setStatus] = useState<string>(initialStatus ?? "draft");
  const supabase = createClient();

  const refetch = useCallback(async () => {
    const { data } = await supabase.from("auctions").select("status").eq("id", auctionId).single();
    if (data) setStatus(data.status);
  }, [auctionId, supabase]);

  useEffect(() => {
    refetch();
    const channel = supabase
      .channel(`auction:${auctionId}:status`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${auctionId}` },
        () => refetch()
      )
      .subscribe();

    const pollInterval = setInterval(refetch, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [auctionId, refetch, supabase]);

  return status;
}
