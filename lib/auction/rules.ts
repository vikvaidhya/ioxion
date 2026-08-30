/**
 * Shared bid-rules evaluation — the SAME logic runs server-side (to validate
 * a bid before insert) and client-side (to show "next valid bid" hints).
 * Keeping this in one module means the UI can never suggest something the
 * server would reject.
 */

export interface Tier {
  upTo: number | null; // null = no upper bound (last tier)
  increment: number;
}

export interface Category {
  name: string;
  basePrice: number;
  tiers: Tier[];
}

export interface Ruleset {
  purseTeam: number;
  minSquadSize: number;
  maxSquadSize: number;
  softCloseSeconds: number;
  categories: Category[];
}

/** Given a current high bid amount and its category, what's the next valid bid? */
export function nextValidBid(currentAmount: number, category: Category): number {
  const tier =
    category.tiers.find((t) => t.upTo !== null && currentAmount < t.upTo) ??
    category.tiers[category.tiers.length - 1];
  return currentAmount + tier.increment;
}

/**
 * A team's max possible bid right now: purse remaining, minus the reserve
 * needed to still fill the minimum squad size after this player.
 * E.g. purse=10L, minSquad=11, squadSoFar=8, cheapest remaining base=1000
 *   -> must keep enough for 2 more slots (11-8-1) at minimum base price.
 */
export function maxPossibleBid(params: {
  purseRemaining: number;
  currentSquadSize: number;
  minSquadSize: number;
  cheapestRemainingBasePrice: number;
}): number {
  const { purseRemaining, currentSquadSize, minSquadSize, cheapestRemainingBasePrice } = params;
  const slotsNeededAfterThis = Math.max(0, minSquadSize - currentSquadSize - 1);
  const reserve = slotsNeededAfterThis * cheapestRemainingBasePrice;
  return Math.max(0, purseRemaining - reserve);
}

export function isValidBid(params: {
  amount: number;
  currentHighBid: number | null;
  basePrice: number;
  category: Category;
  purseRemaining: number;
  currentSquadSize: number;
  minSquadSize: number;
  maxSquadSize: number;
  cheapestRemainingBasePrice: number;
  isPlayerOverseas?: boolean;
  currentOverseasCount?: number;
  maxOverseasPerTeam?: number | null;
}): { valid: true } | { valid: false; reason: string } {
  const {
    amount,
    currentHighBid,
    basePrice,
    category,
    purseRemaining,
    currentSquadSize,
    minSquadSize,
    maxSquadSize,
    cheapestRemainingBasePrice,
    isPlayerOverseas,
    currentOverseasCount,
    maxOverseasPerTeam,
  } = params;

  if (currentSquadSize >= maxSquadSize) {
    return { valid: false, reason: "Squad is already at maximum size." };
  }

  if (
    isPlayerOverseas &&
    maxOverseasPerTeam !== null &&
    maxOverseasPerTeam !== undefined &&
    (currentOverseasCount ?? 0) >= maxOverseasPerTeam
  ) {
    return { valid: false, reason: `Your squad is already at its overseas-player cap (${maxOverseasPerTeam}).` };
  }

  const floor = currentHighBid ?? basePrice;
  const required = currentHighBid === null ? basePrice : nextValidBid(currentHighBid, category);

  if (amount < required) {
    return { valid: false, reason: `Bid must be at least ${required}.` };
  }

  const cap = maxPossibleBid({
    purseRemaining,
    currentSquadSize,
    minSquadSize,
    cheapestRemainingBasePrice,
  });

  if (amount > cap) {
    return { valid: false, reason: `Bid exceeds your max possible bid of ${cap} (purse/squad limit).` };
  }

  return { valid: true };
}
