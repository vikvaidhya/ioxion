import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSessionValid } from "@/lib/session";

export type Role = "org_admin" | "auctioneer" | "owner" | "player";

export interface CurrentUser {
  authUserId: string;
  userId: string;
  email: string;
  fullName: string | null;
  orgId: string;
  orgName: string;
  roles: Role[];
}

/**
 * Resolves the signed-in user plus their app-level profile, org, and roles.
 * Redirects to /login if not authenticated.
 * MVP assumption: single org — a user belongs to exactly one org's memberships.
 * (Multi-org support is additive later: just don't collapse to [0].)
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("auth_user_id", authUser.id)
    .single();

  if (!profile) redirect("/onboarding"); // signed up in auth, but app profile not yet created

  // Single-session enforcement: if a newer login has happened elsewhere for
  // this user, this browser's session token no longer matches the record —
  // sign out here rather than let two sessions silently act as the same
  // owner/admin at once (which caused a real testing incident: two tabs
  // both able to bid as the same team).
  const valid = await isSessionValid(profile.id);
  if (!valid) {
    await supabase.auth.signOut();
    redirect("/login?reason=session_replaced");
  }

  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("role, org_id, orgs(name)")
    .eq("user_id", profile.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  return {
    authUserId: authUser.id,
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    orgId: memberships[0].org_id,
    // @ts-expect-error - supabase-js nested select typing
    orgName: memberships[0].orgs?.name ?? "",
    roles: memberships.map((m) => m.role as Role),
  };
}

export function requireRole(user: CurrentUser, allowed: Role[]) {
  const hasRole = user.roles.some((r) => allowed.includes(r));
  if (!hasRole) redirect("/");
}

/**
 * Non-redirecting variant for use in the root layout, which also serves
 * public pages (login, signup, the public live-auction link) that have no
 * session at all. Returns null instead of redirecting on any failure —
 * used only to fetch the current org's brand color for theming, never for
 * anything security-sensitive.
 */
export async function getOrgThemeColorSafe(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: profile } = await supabase
      .from("users")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .single();
    if (!profile) return null;

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("orgs(theme_color)")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();

    // @ts-expect-error - supabase-js nested select typing
    return membership?.orgs?.theme_color ?? null;
  } catch {
    return null;
  }
}
