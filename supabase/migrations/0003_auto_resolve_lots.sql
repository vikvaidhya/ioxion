-- Automatic lot resolution — server-authoritative, independent of any
-- connected browser. Run this against your existing database (Supabase
-- SQL Editor). Safe to run multiple times (uses CREATE OR REPLACE / DROP
-- IF EXISTS).
--
-- Why this matters: relying on the Auctioneer's browser to notice a timer
-- hit zero and click a button is a real production gap — if their tab
-- loses focus, their connection drops, or they simply look away, a lot
-- would sit "open" forever with no team ever winning it. This function
-- makes resolution happen on the database's own clock, not a client's.

create or replace function resolve_expired_lots() returns void as $$
declare
  expired_lot record;
  winning_bid record;
  team_purse bigint;
begin
  -- Lock candidate rows so two concurrent invocations (e.g. a manual
  -- resolve from the UI firing at the same instant as this scheduled job)
  -- can't both try to resolve the same lot.
  for expired_lot in
    select id, auction_id, auction_player_id
    from lots
    where status = 'open' and closes_at is not null and closes_at < now()
    for update skip locked
  loop
    select b.id, b.team_id, b.amount into winning_bid
    from bids b
    where b.lot_id = expired_lot.id and b.is_voided = false
    order by b.amount desc
    limit 1;

    if winning_bid.id is not null then
      -- Sold
      update lots
        set status = 'sold', closed_at = now(), current_high_bid_id = winning_bid.id
        where id = expired_lot.id;

      update auction_players
        set status = 'sold', sold_to_team_id = winning_bid.team_id, sold_price = winning_bid.amount
        where id = expired_lot.auction_player_id;

      select purse_remaining into team_purse from teams where id = winning_bid.team_id;
      update teams set purse_remaining = team_purse - winning_bid.amount where id = winning_bid.team_id;

      insert into audit_log (org_id, auction_id, action, entity_type, entity_id, metadata)
        select a.org_id, expired_lot.auction_id, 'lot.sold.auto', 'lot', expired_lot.id,
               jsonb_build_object('team_id', winning_bid.team_id, 'amount', winning_bid.amount, 'source', 'pg_cron')
        from auctions a where a.id = expired_lot.auction_id;
    else
      -- Unsold
      update lots set status = 'unsold', closed_at = now() where id = expired_lot.id;
      update auction_players set status = 'unsold' where id = expired_lot.auction_player_id;

      insert into audit_log (org_id, auction_id, action, entity_type, entity_id, metadata)
        select a.org_id, expired_lot.auction_id, 'lot.unsold.auto', 'lot', expired_lot.id,
               jsonb_build_object('source', 'pg_cron')
        from auctions a where a.id = expired_lot.auction_id;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- Schedule it. Requires the pg_cron extension (available on all Supabase
-- plans, including free tier, but must be enabled once via the dashboard:
-- Database -> Extensions -> search "pg_cron" -> Enable).
--
-- NOTE on granularity: pg_cron's underlying scheduler supports 6-field
-- cron expressions (including seconds) on current Supabase Postgres
-- versions. If your project's pg_cron version only supports minute-level
-- scheduling, change '*/5 * * * * *' to '* * * * *' (every minute) — lots
-- will still resolve automatically, just with up to ~60s extra latency
-- instead of ~5s. Given a 10s soft-close timer, 5-second granularity is
-- what actually keeps the auction feeling snappy.

select cron.schedule(
  'resolve-expired-lots',
  '*/5 * * * * *',
  $$ select resolve_expired_lots(); $$
);

-- To check it's running: select * from cron.job;
-- To check execution history: select * from cron.job_run_details order by start_time desc limit 20;
-- To unschedule if needed: select cron.unschedule('resolve-expired-lots');
