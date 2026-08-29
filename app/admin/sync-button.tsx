"use client";

import { useTransition, useState } from "react";
import { syncCricClubsAction } from "./actions";

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ synced: number; failed: number; total: number; allZeroWarning?: number } | null>(null);
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
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Sync CricClubs stats"}
      </button>
      {result && (
        <span className="text-xs font-semibold text-[var(--brand)] bg-[var(--brand-soft)] px-2 py-1 rounded whitespace-nowrap">
          ✓ Synced {result.synced}/{result.total}
          {result.failed > 0 && ` · ${result.failed} failed`}
        </span>
      )}
      {result?.allZeroWarning && (
        <span className="text-xs font-semibold text-[var(--warning)] bg-[var(--warning-soft)] px-2 py-1 rounded whitespace-nowrap max-w-xs text-right">
          ⚠ {result.allZeroWarning} player{result.allZeroWarning !== 1 ? "s" : ""} returned all-zero stats —
          likely a field-mapping issue, check raw_payload in Supabase
        </span>
      )}
      {error && (
        <span className="text-xs font-semibold text-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 rounded whitespace-nowrap">
          {error}
        </span>
      )}
    </div>
  );
}
