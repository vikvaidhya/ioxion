/**
 * iOxion PRODUCTION bootstrap script.
 *
 * Unlike scripts/seed.ts (which creates a full demo org with fake teams,
 * fake owners, and 30 mock players — great for staging, wrong for
 * production), this script creates ONLY:
 *   - the real org
 *   - one real Org Admin login (you provide the email/name)
 *
 * No teams, no players, no mock anything. The Org Admin then needs a way
 * to add real teams/players/owners through the app — as of this build,
 * that UI doesn't exist yet (flagged separately). Until it's built, an
 * Org Admin can still be created here, and real data added via direct
 * SQL/Supabase Table Editor as a stopgap.
 *
 * Usage:
 *   1. Fill SUPABASE_SERVICE_ROLE_KEY into .env.local — MUST be your
 *      PRODUCTION project's key, not staging's. Double-check this.
 *   2. Edit the ORG_NAME / ORG_SLUG / ADMIN_EMAIL / ADMIN_NAME constants
 *      below to your real values.
 *   3. npx tsx scripts/bootstrap-production.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as readline from "readline";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// ---- EDIT THESE BEFORE RUNNING ----
const ORG_NAME = "Coastal Premier League";
const ORG_SLUG = "coastal-premier-league";
const ADMIN_EMAIL = "REPLACE_ME@example.com";
const ADMIN_NAME = "REPLACE_ME";
// ------------------------------------

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  if (ADMIN_EMAIL.includes("REPLACE_ME") || ADMIN_NAME.includes("REPLACE_ME")) {
    console.error(
      "Edit ADMIN_EMAIL and ADMIN_NAME at the top of this script before running it against production."
    );
    process.exit(1);
  }

  console.log(`\nAbout to bootstrap PRODUCTION at: ${url}`);
  console.log(`  Org:   ${ORG_NAME} (${ORG_SLUG})`);
  console.log(`  Admin: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);
  const confirm = await ask("\nType 'yes' to proceed: ");
  if (confirm.trim().toLowerCase() !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .insert({ name: ORG_NAME, slug: ORG_SLUG })
    .select()
    .single();
  if (orgErr) throw orgErr;
  console.log("✓ Org created:", org.id);

  // Generate a strong random temporary password — printed once, admin
  // should change it immediately after first login.
  const tempPassword = `iOx-${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 100)}`;

  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: tempPassword,
    email_confirm: true,
  });
  if (authErr) throw authErr;

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .insert({ auth_user_id: authUser.user.id, email: ADMIN_EMAIL, full_name: ADMIN_NAME })
    .select()
    .single();
  if (profileErr) throw profileErr;

  await supabase.from("org_memberships").insert({ org_id: org.id, user_id: profile.id, role: "org_admin" });

  console.log("\n✓ Production bootstrap complete.");
  console.log(`\n  Admin login: ${ADMIN_EMAIL}`);
  console.log(`  Temporary password: ${tempPassword}`);
  console.log("\n  Change this password immediately after first login.");
  console.log("  No teams, owners, or players were created — add real ones next.");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
