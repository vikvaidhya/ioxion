/**
 * iOxion MVP seed script.
 *
 * Creates: 1 org, 1 auction (draft), 2 teams, a ruleset, and 30 mock players
 * already entered into the auction pool. Also creates auth users for each
 * role so you can log in and test immediately.
 *
 * Usage:
 *   1. Fill SUPABASE_SERVICE_ROLE_KEY into .env.local (never commit it)
 *   2. npx tsx scripts/seed.ts
 *
 * Safe to re-run against a fresh DB; not idempotent against a populated one
 * (will error on unique constraints) — wipe tables first if re-seeding.
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_PASSWORD = "iOxion@2026"; // change after first login

type SeedUser = { email: string; fullName: string; role: string };

const SEED_USERS: SeedUser[] = [
  { email: "admin@ioxion.test", fullName: "Asha Menon", role: "org_admin" },
  { email: "auctioneer@ioxion.test", fullName: "Rahul Dev", role: "auctioneer" },
  { email: "owner1@ioxion.test", fullName: "Priya Nair (Thunderbirds)", role: "owner" },
  { email: "owner2@ioxion.test", fullName: "Karan Shah (Falcons)", role: "owner" },
];

const FIRST_NAMES = [
  "Arjun","Vikram","Rohan","Aditya","Karthik","Suresh","Ravi","Manoj","Deepak","Nikhil",
  "Sanjay","Anand","Vishal","Rajesh","Amit","Gaurav","Harish","Kunal","Mohit","Naveen",
  "Pankaj","Rakesh","Sameer","Tarun","Uday","Varun","Yash","Zaid","Abhishek","Bharat",
];

async function main() {
  console.log("Seeding iOxion MVP data…");

  // 1. Org
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .insert({ name: "Coastal Premier League", slug: "coastal-premier-league" })
    .select()
    .single();
  if (orgErr) throw orgErr;
  console.log("✓ Org created:", org.id);

  // 2. Auth users + app profiles + org memberships
  const userIds: Record<string, string> = {};
  for (const su of SEED_USERS) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: su.email,
      password: SEED_PASSWORD,
      email_confirm: true,
    });
    if (authErr) throw authErr;

    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .insert({ auth_user_id: authUser.user.id, email: su.email, full_name: su.fullName })
      .select()
      .single();
    if (profileErr) throw profileErr;

    await supabase
      .from("org_memberships")
      .insert({ org_id: org.id, user_id: profile.id, role: su.role });

    userIds[su.email] = profile.id;
    console.log(`✓ User created: ${su.email} (${su.role})`);
  }

  // 3. Auction
  const { data: auction, error: aucErr } = await supabase
    .from("auctions")
    .insert({ org_id: org.id, name: "CPL 2026 Auction", status: "configured", created_by: userIds["admin@ioxion.test"] })
    .select()
    .single();
  if (aucErr) throw aucErr;
  console.log("✓ Auction created:", auction.id);

  // 4. Ruleset
  const PURSE = 10_000_000; // ₹1 Cr
  await supabase.from("auction_rulesets").insert({
    auction_id: auction.id,
    currency_type: "real",
    currency_code: "INR",
    currency_symbol: "₹",
    currency_name: "Rupee",
    purse_per_team: PURSE,
    min_squad_size: 11,
    max_squad_size: 15,
    soft_close_seconds: 10,
    unsold_policy: "return_to_pool_end_of_round",
    categories: [
      {
        name: "Category A",
        basePrice: 200000,
        tiers: [
          { upTo: 1000000, increment: 50000 },
          { upTo: 5000000, increment: 100000 },
          { upTo: null, increment: 250000 },
        ],
      },
      {
        name: "Category B",
        basePrice: 100000,
        tiers: [
          { upTo: 2000000, increment: 25000 },
          { upTo: null, increment: 50000 },
        ],
      },
    ],
  });
  console.log("✓ Ruleset created");

  // 5. Teams + owners
  const { data: team1 } = await supabase
    .from("teams")
    .insert({ auction_id: auction.id, name: "Thunderbirds", purse_remaining: PURSE })
    .select()
    .single();
  const { data: team2 } = await supabase
    .from("teams")
    .insert({ auction_id: auction.id, name: "Falcons", purse_remaining: PURSE })
    .select()
    .single();

  await supabase.from("team_owners").insert({ team_id: team1!.id, user_id: userIds["owner1@ioxion.test"] });
  await supabase.from("team_owners").insert({ team_id: team2!.id, user_id: userIds["owner2@ioxion.test"] });
  console.log("✓ Teams created: Thunderbirds, Falcons");

  // 6. 30 mock players + entered into auction pool
  for (let i = 0; i < 30; i++) {
    const name = `${FIRST_NAMES[i]} Kumar`;
    const category = i < 10 ? "Category A" : "Category B";
    const basePrice = category === "Category A" ? 200000 : 100000;

    const { data: player, error: pErr } = await supabase
      .from("players")
      .insert({
        org_id: org.id,
        full_name: name,
        dob: `199${i % 10}-0${(i % 9) + 1}-15`,
        cricclubs_id: `CC${100000 + i}`,
        cricclubs_id_status: "unverified",
        cricclubs_id_source: "admin_import",
      })
      .select()
      .single();
    if (pErr) throw pErr;

    await supabase.from("auction_players").insert({
      auction_id: auction.id,
      player_id: player.id,
      category,
      base_price: basePrice,
      status: "pending",
    });
  }
  console.log("✓ 30 players created and entered into auction pool");

  console.log("\nSeed complete. Login credentials (password for all: " + SEED_PASSWORD + "):");
  SEED_USERS.forEach((u) => console.log(`  ${u.role.padEnd(12)} ${u.email}`));
  console.log(`\nPublic live link token: ${auction.public_link_token}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
