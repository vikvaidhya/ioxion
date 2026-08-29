/**
 * Shows a player's Primary Role plus the score(s) that actually mean
 * something for that role:
 *   - Primary Batsman  -> Batting Score only
 *   - Primary Bowler   -> Bowling Score only
 *   - Any All-Rounder  -> both Batting and Bowling Score, side by side
 * Performance Score is intentionally never shown here — for single-skill
 * players it's redundant with their one relevant score (confirmed against
 * real CricIQ data: e.g. a Primary Batsman's Performance Score always
 * equals their Batting Score), and for all-rounders, two concrete numbers
 * are more informative than one blended one.
 *
 * Used identically across Admin, Owner, Auctioneer, and the public live
 * view, so the display logic can't drift between surfaces.
 */

interface Props {
  primaryRole: string | null;
  battingScore: number | null;
  bowlingScore: number | null;
  size?: "sm" | "md";
}

export function RoleScoreBadge({ primaryRole, battingScore, bowlingScore, size = "md" }: Props) {
  if (!primaryRole) return null;

  const isAllRounder = primaryRole.toLowerCase().includes("all-rounder");
  const isBowler = !isAllRounder && primaryRole.toLowerCase().includes("bowler");
  const isBatsman = !isAllRounder && primaryRole.toLowerCase().includes("batsman");

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-1";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`${textSize} uppercase tracking-wide text-[var(--ink-soft)] bg-white ${padding} rounded font-semibold`}>
        {primaryRole}
      </span>
      {isAllRounder && (
        <>
          {battingScore !== null && (
            <span className={`${textSize} font-mono font-semibold text-[var(--brand)] bg-[var(--brand-soft)] ${padding} rounded`}>
              🏏 {battingScore}
            </span>
          )}
          {bowlingScore !== null && (
            <span className={`${textSize} font-mono font-semibold text-[var(--brand)] bg-[var(--brand-soft)] ${padding} rounded`}>
              🎯 {bowlingScore}
            </span>
          )}
        </>
      )}
      {isBatsman && battingScore !== null && (
        <span className={`${textSize} font-mono font-semibold text-[var(--brand)] bg-[var(--brand-soft)] ${padding} rounded`}>
          🏏 {battingScore}
        </span>
      )}
      {isBowler && bowlingScore !== null && (
        <span className={`${textSize} font-mono font-semibold text-[var(--brand)] bg-[var(--brand-soft)] ${padding} rounded`}>
          🎯 {bowlingScore}
        </span>
      )}
    </div>
  );
}
