import { ListChecks } from "lucide-react";

interface Team {
  id: string;
  name: string;
}

interface RoleQuota {
  role: string;
  minCount: number;
}

interface SquadRoleCounts {
  [teamId: string]: { [role: string]: number };
}

interface Props {
  teams: Team[];
  quotas: RoleQuota[];
  countsByTeamAndRole: SquadRoleCounts;
}

/**
 * Purely informational — see the "why not bid-blocking" note in
 * rules-editor.tsx. This shows each team's progress toward their
 * configured role targets so Admin/Owners can plan, without the app
 * pretending it can safely enforce a minimum mid-auction.
 */
export function CompositionTracker({ teams, quotas, countsByTeamAndRole }: Props) {
  if (quotas.length === 0) return null;

  return (
    <div className="bg-white border border-[var(--line)] rounded-lg p-5">
      <h2 className="font-semibold text-sm flex items-center gap-2 mb-3">
        <ListChecks size={16} className="text-[var(--brand)]" />
        Squad composition targets
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)] border-b border-[var(--line)]">
              <th className="py-1.5 pr-4">Team</th>
              {quotas.map((q) => (
                <th key={q.role} className="py-1.5 pr-4 whitespace-nowrap">
                  {q.role} (min {q.minCount})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-[var(--paper)] last:border-0">
                <td className="py-1.5 pr-4 font-medium">{t.name}</td>
                {quotas.map((q) => {
                  const count = countsByTeamAndRole[t.id]?.[q.role] ?? 0;
                  const met = count >= q.minCount;
                  return (
                    <td key={q.role} className="py-1.5 pr-4 font-mono">
                      <span className={met ? "text-[var(--brand)]" : "text-[var(--warning)]"}>
                        {count}/{q.minCount}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
