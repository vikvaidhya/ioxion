"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteOwnerAction, inviteAuctioneerAction } from "./setup-actions";
import { UserPlus, Copy, Check } from "lucide-react";

interface Props {
  teams?: { id: string; name: string }[]; // provided when inviting an owner (must pick a team)
  mode: "owner" | "auctioneer";
}

export function InvitePersonForm({ teams, mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamId, setTeamId] = useState(teams?.[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res =
        mode === "owner"
          ? await inviteOwnerAction({ email, fullName, teamId })
          : await inviteAuctioneerAction({ email, fullName });

      if (res?.error) {
        setError(res.error);
      } else if (res?.success) {
        setResult({ email: res.email, tempPassword: res.tempPassword });
        setEmail("");
        setFullName("");
        router.refresh();
      }
    });
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.email}\nTemporary password: ${result.tempPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (result) {
    return (
      <div className="border border-[var(--line)] rounded-lg p-4 bg-[var(--brand-soft)]">
        <p className="text-sm font-semibold mb-2">✓ Account created for {result.email}</p>
        <p className="text-xs text-[var(--ink-soft)] mb-2">
          Share these credentials with them directly — iOxion doesn't send email yet. They should
          change this password after first login.
        </p>
        <div className="bg-white rounded border border-[var(--line)] px-3 py-2 font-mono text-xs mb-2">
          {result.email} / {result.tempPassword}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy credentials"}
          </button>
          <button
            onClick={() => setResult(null)}
            className="text-xs font-semibold text-[var(--ink-soft)] hover:underline"
          >
            Invite another
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="border border-dashed border-[#C7C0AE] rounded-lg p-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors w-full"
      >
        <UserPlus size={14} /> Invite {mode === "owner" ? "an owner" : "an auctioneer"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[var(--line)] rounded-lg p-4 bg-white space-y-2">
      <input
        autoFocus
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Full name"
        className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
      />
      {mode === "owner" && teams && teams.length > 0 && (
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {mode === "owner" && (!teams || teams.length === 0) && (
        <p className="text-xs text-[var(--danger)]">Add a team first before inviting an owner.</p>
      )}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || (mode === "owner" && (!teams || teams.length === 0))}
          className="flex-1 py-1.5 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create account"}
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
