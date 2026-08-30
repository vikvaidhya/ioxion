"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayerAction } from "./setup-actions";
import { Plus } from "lucide-react";

interface Props {
  auctionId: string;
  categories: { name: string; basePrice: number }[];
  currencySymbol?: string;
}

export function AddPlayerForm({ auctionId, categories, currencySymbol = "₹" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [cricclubsId, setCricclubsId] = useState("");
  const [category, setCategory] = useState(categories[0]?.name ?? "");
  const [isOverseas, setIsOverseas] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.name === category);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addPlayerAction({
        fullName,
        dob: dob || null,
        cricclubsId: cricclubsId || null,
        category,
        basePrice: selectedCategory?.basePrice ?? 0,
        auctionId,
        isOverseas,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setFullName("");
        setDob("");
        setCricclubsId("");
        setIsOverseas(false);
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition-colors flex items-center gap-1"
      >
        <Plus size={13} /> Add player
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--line)] rounded-lg p-4 bg-[var(--paper)] space-y-2 mb-4">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
        <input
          value={cricclubsId}
          onChange={(e) => setCricclubsId(e.target.value)}
          placeholder="CricClubs ID (optional)"
          className="px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        >
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} (base {currencySymbol}{c.basePrice.toLocaleString("en-IN")})
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">
        <input type="checkbox" checked={isOverseas} onChange={(e) => setIsOverseas(e.target.checked)} className="rounded" />
        Overseas / guest player
      </label>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="py-1.5 px-4 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add to pool"}
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
