"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ensureAuctionAction } from "./setup-actions";
import { Gavel } from "lucide-react";

export function CreateAuctionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await ensureAuctionAction(name);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-white border border-[var(--line)] rounded-lg p-8 text-center max-w-md mx-auto">
      <Gavel className="mx-auto mb-3 text-[var(--brand)]" size={28} />
      <h1 className="font-semibold text-lg mb-1">Set up your first auction</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        This creates the auction shell with default rules — you can adjust everything after.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3 text-left">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)] mb-1">
            Auction name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cal Premier League 2026"
            className="w-full px-3 py-2 rounded-md border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
          />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 rounded-md bg-[var(--brand)] text-white text-sm font-semibold hover:bg-[var(--brand-hover)] disabled:opacity-60 transition-colors"
        >
          {isPending ? "Creating…" : "Create auction"}
        </button>
      </form>
    </div>
  );
}
