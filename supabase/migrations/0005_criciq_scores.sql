-- Adds role/score fields from the updated CricIQ tournament report.
-- Safe to run against your existing database — additive only.

alter table criciq_snapshots
  add column if not exists role_basis text,
  add column if not exists batting_score numeric,
  add column if not exists bowling_score numeric,
  add column if not exists performance_score numeric;
