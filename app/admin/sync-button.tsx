"use client";

import { useTransition, useState } from "react";
import { syncCricClubsAction } from "./actions";

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ synced: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await syncCricClubsAction();
        setResult(res ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed — see server logs.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[#1B4332] text-white hover:bg-[#153726] transition-colors disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync CricClubs stats"}
      </button>
      {result && (
        <span className="text-xs font-semibold text-[#1B4332] bg-[#EFEADD] px-2 py-1 rounded whitespace-nowrap">
          ✓ Synced {result.synced}/{result.total}
          {result.failed > 0 && ` · ${result.failed} failed`}
        </span>
      )}
      {error && (
        <span className="text-xs font-semibold text-[#7A2E2E] bg-[#F5E6E6] px-2 py-1 rounded whitespace-nowrap">
          {error}
        </span>
      )}
    </div>
  );
}
