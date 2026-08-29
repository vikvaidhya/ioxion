-- Lets an Admin manually correct a player's Primary Role (e.g. CricIQ
-- misclassified someone) WITHOUT touching criciq_snapshots, which stays
-- append-only/untouched as real historical record. When set, role_override
-- takes precedence over whatever the latest CricIQ snapshot says for
-- display purposes — the underlying Batting/Bowling Score numbers still
-- come from the real CricIQ data either way, only the role label changes.
-- Safe to run against your existing database — additive only.

alter table players
  add column if not exists role_override text;
