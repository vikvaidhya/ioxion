-- Adds structured stat columns to criciq_snapshots so the rich batting/
-- bowling stats from a CricIQ tournament report can be queried and
-- displayed cleanly, not just buried inside raw_payload JSON.
--
-- NOTE on future CricClubs overlap: CricClubs sync (cricclubs_snapshots)
-- and CricIQ upload (criciq_snapshots) both capture some overlapping stats
-- (matches played, batting average, strike rate). This is intentional for
-- now — they're kept as two separate snapshot histories rather than
-- merged, since CricIQ's report includes a richer stat set CricClubs'
-- basic endpoint doesn't. Deciding whether one should override the other,
-- or how to reconcile if they disagree, is a deliberate future decision,
-- not resolved here.
--
-- Safe to run against your existing seeded database — additive only.

alter table criciq_snapshots
  add column if not exists runs int,
  add column if not exists innings int,
  add column if not exists not_outs int,
  add column if not exists batting_avg numeric,
  add column if not exists strike_rate numeric,
  add column if not exists highest_score int,
  add column if not exists fifties int,
  add column if not exists hundreds int,
  add column if not exists fours int,
  add column if not exists sixes int,
  add column if not exists ducks int,
  add column if not exists boundary_pct numeric,
  add column if not exists wickets int,
  add column if not exists overs numeric,
  add column if not exists maidens int,
  add column if not exists economy numeric,
  add column if not exists bowling_avg numeric,
  add column if not exists bowling_sr numeric,
  add column if not exists primary_role text,
  add column if not exists persona text;
