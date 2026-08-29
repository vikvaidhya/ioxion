"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeamAction } from "./setup-actions";
import { Plus } from "lucide-react";

export function AddTeamForm({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTeamAction(auctionId, name);
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border border-dashed border-[#C7C0AE] rounded-lg p-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors"
      >
        <Plus size={14} /> Add team
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--line)] rounded-lg p-4 bg-white space-y-2">
      <input
        autoFocus
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name"
        className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
      />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-1.5 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
