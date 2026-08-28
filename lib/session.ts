"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const SESSION_COOKIE = "ioxion_session_token";

/**
 * Called right after a successful Supabase Auth login. Generates a fresh
 * session_token, overwrites any previous one for this user (single-session
 * enforcement — logging in elsewhere invalidates the old session), and
 * stores the new token in an httpOnly cookie on THIS browser.
 */
export async function registerSessionAction(authUserId: string, userAgent: string) {
  const adminDb = createAdminClient();

  const { data: profile } = await adminDb
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();

  if (!profile) return { error: "User profile not found." };

  const token = randomUUID();

  const { error } = await adminDb
    .from("active_sessions")
    .upsert({ user_id: profile.id, session_token: token, user_agent: userAgent, created_at: new Date().toISOString() });

  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days — matches typical Supabase session length
  });

  return { success: true };
}

/**
 * Checks whether THIS browser's session token still matches the one on
 * record for the user (i.e. no one has logged in elsewhere since). Called
 * from getCurrentUser() on every authenticated page/action.
 */
export async function isSessionValid(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const myToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!myToken) return false;

  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from("active_sessions")
    .select("session_token")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.session_token === myToken;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
