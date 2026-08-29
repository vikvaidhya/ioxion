"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTeamAction, deleteTeamAction } from "./setup-actions";
import { Shield, Pencil, Check, X, Trash2 } from "lucide-react";

interface Props {
  team: { id: string; name: string; purse_remaining: number };
  currencySymbol: string;
  owners: { email: string; full_name: string | null }[];
  auctionId: string;
}

export function TeamCard({ team, currencySymbol, owners, auctionId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [purse, setPurse] = useState(team.purse_remaining);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateTeamAction(team.id, { name, purseRemaining: purse });
      if (result?.error) {
        setError(result.error);
      } else {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTeamAction(team.id, auctionId);
      if (result?.error) {
        setError(result.error);
        setConfirmingDelete(false);
      } else {
        router.refresh();
      }
    });
  };

  if (editing) {
    return (
      <div className="bg-white border border-[var(--brand)] rounded-lg p-4 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-2 py-1.5 rounded border border-[var(--line)] text-sm font-medium"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--ink-soft)]">{currencySymbol}</span>
          <input
            type="number"
            value={purse}
            onChange={(e) => setPurse(Number(e.target.value))}
            className="flex-1 px-2 py-1.5 rounded border border-[var(--line)] text-sm font-mono"
          />
        </div>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-50"
          >
            <Check size={12} /> {isPending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(team.name);
              setPurse(team.purse_remaining);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-[var(--line)] text-xs font-semibold text-[var(--ink-soft)]"
          >
            <X size={12} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[var(--line)] rounded-lg p-4 group relative">
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-1 text-[var(--ink-soft)] hover:text-[var(--brand)]"
          title="Edit team"
        >
          <Pencil size={13} />
        </button>
        {confirmingDelete ? (
          <>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-[10px] font-semibold text-[var(--danger)] px-1.5 py-0.5 rounded bg-[var(--danger-soft)]"
            >
              Confirm?
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="p-1 text-[var(--ink-soft)]">
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="p-1 text-[var(--ink-soft)] hover:text-[var(--danger)]"
            title="Delete team"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mb-2">
        <Shield className="text-[var(--brand)]" size={18} />
        <div>
          <div className="font-medium">{team.name}</div>
          <div className="text-xs text-[var(--ink-soft)] font-mono">
            Purse: {currencySymbol}
            {Number(team.purse_remaining).toLocaleString("en-IN")}
          </div>
        </div>
      </div>
      {owners.length > 0 ? (
        <div className="text-xs text-[var(--ink-soft)] pl-7">Owner: {owners.map((o) => o.full_name || o.email).join(", ")}</div>
      ) : (
        <div className="text-xs text-[var(--ink-faint)] pl-7">No owner assigned yet</div>
      )}
      {error && !editing && <p className="text-xs text-[var(--danger)] pl-7 mt-1">{error}</p>}
    </div>
  );
}