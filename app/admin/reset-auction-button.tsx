"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAuctionAction } from "./setup-actions";
import { RotateCcw, AlertTriangle, X } from "lucide-react";

export function ResetAuctionButton({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clearRetentions, setClearRetentions] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim().toUpperCase() === "RESET";

  const handleReset = () => {
    if (!canConfirm) return;
    setError(null);
    startTransition(async () => {
      const result = await resetAuctionAction(auctionId, clearRetentions);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setConfirmText("");
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--danger)] hover:underline"
      >
        <RotateCcw size={14} /> Reset auction
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-[var(--paper)] rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-full bg-[var(--danger-soft)]">
            <AlertTriangle size={18} className="text-[var(--danger)]" />
          </div>
          <h2 className="font-display font-semibold text-lg">Reset auction?</h2>
        </div>

        <p className="text-sm text-[var(--ink-soft)] mb-3">
          This permanently deletes every bid, returns every lot to queued, and un-sells every player won
          through live bidding. Team purses are recalculated from scratch. This cannot be undone.
        </p>

        <label className="flex items-start gap-2 text-sm text-[var(--ink-soft)] mb-4 bg-white border border-[var(--line)] rounded-lg p-3">
          <input
            type="checkbox"
            checked={clearRetentions}
            onChange={(e) => setClearRetentions(e.target.checked)}
            className="rounded mt-0.5"
          />
          <span>
            Also clear pre-draft retentions
            <span className="block text-xs text-[var(--ink-faint)] mt-0.5">
              Off by default — retentions are pre-draft setup, not live-auction progress, so they're kept
              unless you check this.
            </span>
          </span>
        </label>

        <label className="block text-xs font-semibold text-[var(--ink-soft)] mb-1.5">
          Type <span className="font-mono text-[var(--danger)]">RESET</span> to confirm
        </label>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESET"
          className="w-full px-3 py-2 rounded-md border border-[var(--line)] text-sm font-mono mb-4"
        />

        {error && <p className="text-sm text-[var(--danger)] mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!canConfirm || isPending}
            className="flex-1 py-2.5 rounded-md bg-[var(--danger)] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            {isPending ? "Resetting…" : "Reset everything"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setConfirmText("");
              setError(null);
            }}
            className="px-4 py-2.5 rounded-md border border-[var(--line)] text-sm font-semibold text-[var(--ink-soft)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
