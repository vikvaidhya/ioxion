-- Supports pausing a live auction. When paused, the currently open lot's
-- closes_at is cleared (so the safety-net pg_cron job never resolves it —
-- its WHERE clause requires closes_at < now(), which is never true for
-- NULL) and the remaining seconds are stashed here so resuming restarts
-- the timer fairly instead of resetting to the full duration.
-- Safe to run against your existing database — additive only.

alter table lots
  add column if not exists frozen_seconds_remaining int;
