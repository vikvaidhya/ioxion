-- Pre-draft/retention rules, overseas quota, and role composition targets.
-- Safe to run against your existing database — additive only.

alter table auction_rulesets
  add column if not exists max_retentions_per_team int not null default 0,
  add column if not exists max_overseas_per_team int, -- null = no cap
  add column if not exists role_quotas jsonb not null default '[]'; -- [{role, minCount}] — tracked/displayed, not bid-blocking (see app notes)

alter table players
  add column if not exists is_overseas boolean not null default false;

-- NOTE on auction_players: is_retained / retained_by_team_id already existed
-- from the original schema (0001_init.sql) but were never actually used by
-- any app code until this feature. A retained player is represented as:
--   status = 'sold', sold_to_team_id = <team>, sold_price = <admin-set price>,
--   is_retained = true, retained_by_team_id = <same team>
-- This means retained players are automatically excluded from the live lot
-- queue (which only queues status='pending' players) with no special-casing
-- needed elsewhere in the auction engine.
