"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveExpiredLot } from "@/lib/auction/resolve-lot";
import { revalidatePath } from "next/cache";

/**
 * Callable by ANY authenticated user (owner included, not just
 * auctioneer/org_admin) — see the safety rationale in resolve-lot.ts.
 * Wired into useLiveAuction's polling so both the Owner and Auctioneer
 * screens self-heal an expired lot on their own, the same way the public
 * live view's polling does, rather than depending solely on the
 * Auctioneer's explicit action or the pg_cron backup job's timing.
 */
export async function autoResolveIfExpiredAction(lotId: string) {
  await getCurrentUser(); // just confirms a real session exists; redirects to /login otherwise
  const adminDb = createAdminClient();
  const result = await resolveExpiredLot(adminDb, lotId);
  if (result.resolved) {
    revalidatePath("/owner");
    revalidatePath("/auctioneer");
  }
  return result;
}
