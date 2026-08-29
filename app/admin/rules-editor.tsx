"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRulesetAction } from "./setup-actions";
import { Plus, Trash2, Settings, X, Check } from "lucide-react";

interface Tier {
  id: string;
  upTo: number | null;
  increment: number;
}

interface Category {
  id: string;
  name: string;
  basePrice: number;
  tiers: Tier[];
}

interface Ruleset {
  purse_per_team: number;
  min_squad_size: number;
  max_squad_size: number;
  soft_close_seconds: number;
  currency_type: "real" | "custom";
  currency_symbol: string;
  currency_name: string;
  categories: { name: string; basePrice: number; tiers: { upTo: number | null; increment: number }[] }[];
}

const uid = () => Math.random().toString(36).slice(2, 9);

const REAL_CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
];

interface Props {
  auctionId: string;
  initialRuleset: Ruleset;
  hasAnySoldPlayers: boolean;
}

export function RulesEditor({ auctionId, initialRuleset, hasAnySoldPlayers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [purse, setPurse] = useState(initialRuleset.purse_per_team);
  const [minSquad, setMinSquad] = useState(initialRuleset.min_squad_size);
  const [maxSquad, setMaxSquad] = useState(initialRuleset.max_squad_size);
  const [softClose, setSoftClose] = useState(initialRuleset.soft_close_seconds);
  const [currencyType, setCurrencyType] = useState<"real" | "custom">(initialRuleset.currency_type);
  const [currencyCode, setCurrencyCode] = useState(
    REAL_CURRENCIES.find((c) => c.symbol === initialRuleset.currency_symbol)?.code ?? "INR"
  );
  const [customSymbol, setCustomSymbol] = useState(initialRuleset.currency_symbol);
  const [customName, setCustomName] = useState(initialRuleset.currency_name);
  const [categories, setCategories] = useState<Category[]>(
    initialRuleset.categories.map((c) => ({
      id: uid(),
      name: c.name,
      basePrice: c.basePrice,
      tiers: c.tiers.map((t) => ({ id: uid(), upTo: t.upTo, increment: t.increment })),
    }))
  );

  const activeSymbol = currencyType === "real" ? REAL_CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? "₹" : customSymbol;
  const activeName = currencyType === "real" ? REAL_CURRENCIES.find((c) => c.code === currencyCode)?.name ?? "Rupee" : customName;

  const updateCategory = (id: string, patch: Partial<Category>) =>
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const updateTier = (catId: string, tierId: string, patch: Partial<Tier>) =>
    setCategories((cs) =>
      cs.map((c) => (c.id !== catId ? c : { ...c, tiers: c.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)) }))
    );

  const addTier = (catId: string) =>
    setCategories((cs) => cs.map((c) => (c.id === catId ? { ...c, tiers: [...c.tiers, { id: uid(), upTo: null, increment: 0 }] } : c)));

  const removeTier = (catId: string, tierId: string) =>
    setCategories((cs) => cs.map((c) => (c.id !== catId ? c : { ...c, tiers: c.tiers.filter((t) => t.id !== tierId) })));

  const addCategory = () =>
    setCategories((cs) => [...cs, { id: uid(), name: `Category ${String.fromCharCode(65 + cs.length)}`, basePrice: 0, tiers: [{ id: uid(), upTo: null, increment: 0 }] }]);

  const removeCategory = (id: string) => setCategories((cs) => cs.filter((c) => c.id !== id));

  const handleSave = () => {
    setError(null);
    if (categories.length === 0) {
      setError("At least one category is required.");
      return;
    }
    startTransition(async () => {
      const result = await updateRulesetAction(auctionId, {
        purse_per_team: purse,
        min_squad_size: minSquad,
        max_squad_size: maxSquad,
        soft_close_seconds: softClose,
        currency_type: currencyType,
        currency_symbol: activeSymbol,
        currency_name: activeName,
        categories: categories.map((c) => ({
          name: c.name,
          basePrice: c.basePrice,
          tiers: c.tiers.map((t) => ({ upTo: t.upTo, increment: t.increment })),
        })),
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--brand)] hover:underline"
      >
        <Settings size={14} /> Edit auction rules
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        className="bg-[var(--paper)] rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--paper)] border-b border-[var(--line)] px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Settings size={18} className="text-[var(--brand)]" /> Auction Rules
          </h2>
          <button onClick={() => setOpen(false)} className="text-[var(--ink-soft)] hover:text-[var(--ink-soft)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {hasAnySoldPlayers && (
            <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--ink-soft)]">
              Some players have already been sold in this auction. Changing the purse or squad size now
              won't retroactively affect completed sales, but will apply going forward — double check
              this is intended.
            </div>
          )}

          {/* Currency */}
          <div className="bg-white border border-[var(--line)] rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">Currency</h3>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setCurrencyType("real")}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                  currencyType === "real" ? "bg-[var(--brand)] text-white border-[var(--brand)]" : "border-[var(--line)] text-[var(--ink-soft)]"
                }`}
              >
                Real currency
              </button>
              <button
                onClick={() => setCurrencyType("custom")}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                  currencyType === "custom" ? "bg-[var(--brand)] text-white border-[var(--brand)]" : "border-[var(--line)] text-[var(--ink-soft)]"
                }`}
              >
                Play currency
              </button>
            </div>
            {currencyType === "real" ? (
              <div className="grid grid-cols-4 gap-2">
                {REAL_CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setCurrencyCode(c.code)}
                    className={`px-2 py-1.5 rounded text-xs font-semibold border ${
                      currencyCode === c.code ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]" : "border-[var(--line)] text-[var(--ink-soft)]"
                    }`}
                  >
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  placeholder="Symbol (e.g. Ⓜ)"
                  className="px-2 py-1.5 rounded border border-[var(--line)] text-sm"
                />
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Name (e.g. Monopoly Money)"
                  className="px-2 py-1.5 rounded border border-[var(--line)] text-sm"
                />
              </div>
            )}
          </div>

          {/* Purse & squad */}
          <div className="bg-white border border-[var(--line)] rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Purse & squad size</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[var(--ink-soft)] mb-1">Purse per team</label>
                <input
                  type="number"
                  value={purse}
                  onChange={(e) => setPurse(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--ink-soft)] mb-1">Min squad size</label>
                <input
                  type="number"
                  value={minSquad}
                  onChange={(e) => setMinSquad(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--ink-soft)] mb-1">Max squad size</label>
                <input
                  type="number"
                  value={maxSquad}
                  onChange={(e) => setMaxSquad(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className="bg-white border border-[var(--line)] rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-2">Soft-close timer</h3>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="5"
                max="30"
                value={softClose}
                onChange={(e) => setSoftClose(Number(e.target.value))}
                className="flex-1 accent-[var(--brand)]"
              />
              <div className="font-mono text-lg font-semibold w-16 text-right">{softClose}s</div>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm px-1">Categories & increments</h3>
            {categories.map((cat) => (
              <div key={cat.id} className="bg-white border border-[var(--line)] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                    placeholder="Category name"
                    className="px-2 py-1.5 rounded border border-[var(--line)] text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--ink-soft)]">{activeSymbol}</span>
                    <input
                      type="number"
                      value={cat.basePrice}
                      onChange={(e) => updateCategory(cat.id, { basePrice: Number(e.target.value) })}
                      placeholder="Base price"
                      className="flex-1 px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="text-xs uppercase tracking-wide text-[var(--ink-soft)] font-semibold mb-1.5">Increment tiers</div>
                <div className="space-y-1.5">
                  {cat.tiers.map((tier, i) => (
                    <div key={tier.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={tier.upTo ?? ""}
                        onChange={(e) => updateTier(cat.id, tier.id, { upTo: e.target.value ? Number(e.target.value) : null })}
                        placeholder={i === cat.tiers.length - 1 ? "no limit" : "up to"}
                        disabled={i === cat.tiers.length - 1}
                        className="flex-1 px-2 py-1 rounded border border-[var(--line)] text-xs font-mono disabled:bg-[var(--paper)]"
                      />
                      <span className="text-[var(--ink-faint)] text-xs">→ +</span>
                      <input
                        type="number"
                        value={tier.increment}
                        onChange={(e) => updateTier(cat.id, tier.id, { increment: Number(e.target.value) })}
                        placeholder="increment"
                        className="w-24 px-2 py-1 rounded border border-[var(--line)] text-xs font-mono"
                      />
                      <button
                        onClick={() => removeTier(cat.id, tier.id)}
                        disabled={cat.tiers.length === 1}
                        className="p-1 text-[var(--ink-faint)] hover:text-[var(--danger)] disabled:opacity-30"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <button onClick={() => addTier(cat.id)} className="text-xs font-semibold text-[var(--brand)] flex items-center gap-1">
                    <Plus size={11} /> Add tier
                  </button>
                  <button onClick={() => removeCategory(cat.id)} className="text-xs text-[var(--danger)]">
                    Remove category
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={addCategory}
              className="w-full py-2.5 rounded-lg border border-dashed border-[#C7C0AE] text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors flex items-center justify-center gap-1"
            >
              <Plus size={13} /> Add category
            </button>
          </div>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-[var(--paper)] border-t border-[var(--line)] px-6 py-4 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-md border border-[var(--line)] text-sm font-semibold text-[var(--ink-soft)]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2 rounded-md bg-[var(--brand)] text-white text-sm font-semibold hover:bg-[var(--brand-hover)] disabled:opacity-60 flex items-center gap-1.5"
          >
            {saved ? <Check size={14} /> : null}
            {isPending ? "Saving…" : saved ? "Saved" : "Save rules"}
          </button>
        </div>
      </div>
    </div>
  );
}
