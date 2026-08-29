"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrgThemeAction } from "./setup-actions";
import { Palette, Check } from "lucide-react";

const PRESETS = [
  { name: "Outfield", hex: "#1B6B4A" },
  { name: "Stadium Teal", hex: "#0E6E6E" },
  { name: "Floodlight Gold", hex: "#A67C00" },
  { name: "Pitch Clay", hex: "#8C4A2F" },
  { name: "Night Navy", hex: "#1E3A5F" },
  { name: "Ball Red", hex: "#8C2F2F" },
];

export function AppearanceSettings({ currentColor }: { currentColor: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(currentColor);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = (hex: string) => {
    setError(null);
    setColor(hex);
    startTransition(async () => {
      const result = await updateOrgThemeAction(hex);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
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
        <Palette size={14} /> Appearance
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div
        className="bg-[var(--paper)] rounded-xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
          <Palette size={18} className="text-[var(--brand)]" /> Brand color
        </h2>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Sets the accent color across every screen — buttons, badges, and highlights all derive
          from this one choice.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.hex}
              onClick={() => handleSave(p.hex)}
              disabled={isPending}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                color.toLowerCase() === p.hex.toLowerCase()
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)] hover:border-[var(--brand)]"
              }`}
            >
              <span
                className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center"
                style={{ backgroundColor: p.hex }}
              >
                {color.toLowerCase() === p.hex.toLowerCase() && <Check size={13} className="text-white" />}
              </span>
              <span className="text-[10px] font-medium text-[var(--ink-soft)] text-center leading-tight">
                {p.name}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-9 h-9 rounded border border-[var(--line)] cursor-pointer"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#1B6B4A"
            className="flex-1 px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
          />
          <button
            onClick={() => handleSave(color)}
            disabled={isPending}
            className="px-3 py-1.5 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-50"
          >
            {isPending ? "Saving…" : saved ? "Saved ✓" : "Apply"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--danger)] mb-2">{error}</p>}

        <button
          onClick={() => setOpen(false)}
          className="w-full mt-2 px-4 py-2 rounded-md border border-[var(--line)] text-sm font-semibold text-[var(--ink-soft)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
