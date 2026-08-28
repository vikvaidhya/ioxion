/**
 * Small but important safety net: makes it visually obvious what you're
 * looking at. NOTE: staging and production currently share the SAME
 * Supabase database (a deliberate cost-saving choice — see RUNBOOK.md) —
 * they're separated by org_id/RLS, not by infrastructure. That means the
 * old "which database am I pointed at" question doesn't apply here; what
 * actually matters is (a) which Vercel deployment you're on, and (b) which
 * org's data you're viewing within it. This banner covers (a); org name
 * shown in each page's header covers (b) — always check both.
 */
export function getEnvironmentLabel(): { label: string; isProd: boolean } {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development";
  return { label: vercelEnv, isProd: vercelEnv === "production" };
}
