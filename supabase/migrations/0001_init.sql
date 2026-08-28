-- iOxion MVP schema — single org, 2 teams, ≤30 players, all core roles.
-- Structurally identical to the full multi-tenant design (org_id everywhere),
-- so growing into multi-tenant SaaS later is additive, not a rewrite.

create extension if not exists "pgcrypto";

create table orgs (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    slug        text not null unique,
    created_at  timestamptz not null default now()
);

create table users (
    id            uuid primary key default gen_random_uuid(),
    auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
    email         text not null unique,
    full_name     text,
    created_at    timestamptz not null default now()
);

create table org_memberships (
    id         uuid primary key default gen_random_uuid(),
    org_id     uuid not null references orgs(id) on delete cascade,
    user_id    uuid not null references users(id) on delete cascade,
    role       text not null check (role in ('org_admin','auctioneer','owner','player')),
    created_at timestamptz not null default now(),
    unique (org_id, user_id, role)
);

create table players (
    id                   uuid primary key default gen_random_uuid(),
    org_id               uuid not null references orgs(id) on delete cascade,
    user_id              uuid references users(id),
    full_name            text not null,
    dob                  date,
    phone                text,
    email                text,
    photo_url            text,
    cricclubs_id         text,
    cricclubs_id_status  text not null default 'unverified'
                           check (cricclubs_id_status in ('unverified','pending_verification','verified')),
    cricclubs_id_source  text check (cricclubs_id_source in ('admin_import','self_entered')),
    created_at           timestamptz not null default now()
);

create table cricclubs_snapshots (
    id             uuid primary key default gen_random_uuid(),
    player_id      uuid not null references players(id) on delete cascade,
    synced_at      timestamptz not null default now(),
    synced_by      uuid references users(id),
    raw_payload    jsonb not null,
    matches_played int,
    batting_avg    numeric,
    batting_sr     numeric,
    bowling_avg    numeric,
    bowling_econ   numeric,
    profile_data   jsonb
);

create table criciq_snapshots (
    id           uuid primary key default gen_random_uuid(),
    player_id    uuid not null references players(id) on delete cascade,
    synced_at    timestamptz not null default now(),
    synced_by    uuid references users(id),
    raw_payload  jsonb not null,
    summary_text text
);

create table auctions (
    id                uuid primary key default gen_random_uuid(),
    org_id            uuid not null references orgs(id) on delete cascade,
    name              text not null,
    status            text not null default 'draft'
                        check (status in ('draft','configured','live','paused','completed','cancelled')),
    public_link_token text unique default encode(gen_random_bytes(16), 'hex'),
    created_by        uuid references users(id),
    created_at        timestamptz not null default now()
);

create table auction_rulesets (
    id                 uuid primary key default gen_random_uuid(),
    auction_id         uuid not null unique references auctions(id) on delete cascade,
    currency_type      text not null default 'real' check (currency_type in ('real','custom')),
    currency_code      text,
    currency_symbol    text not null default '₹',
    currency_name      text not null default 'Rupee',
    purse_per_team     bigint not null,
    min_squad_size     int not null,
    max_squad_size     int not null,
    soft_close_seconds int not null default 10,
    unsold_policy      text not null default 'return_to_pool_end_of_round'
                         check (unsold_policy in ('return_to_pool_end_of_round','return_to_pool_immediately','out_of_auction')),
    categories         jsonb not null default '[]',
    updated_at         timestamptz not null default now()
);

create table teams (
    id              uuid primary key default gen_random_uuid(),
    auction_id      uuid not null references auctions(id) on delete cascade,
    name            text not null,
    logo_url        text,
    purse_remaining bigint not null,
    created_at      timestamptz not null default now()
);

create table team_owners (
    id         uuid primary key default gen_random_uuid(),
    team_id    uuid not null references teams(id) on delete cascade,
    user_id    uuid not null references users(id),
    created_at timestamptz not null default now(),
    unique (team_id, user_id)
);

create table auction_players (
    id                   uuid primary key default gen_random_uuid(),
    auction_id           uuid not null references auctions(id) on delete cascade,
    player_id            uuid not null references players(id) on delete cascade,
    category             text,
    base_price           bigint not null,
    is_retained          boolean not null default false,
    retained_by_team_id  uuid references teams(id),
    status               text not null default 'pending'
                           check (status in ('pending','in_lot','sold','unsold','withdrawn')),
    sold_to_team_id      uuid references teams(id),
    sold_price           bigint,
    created_at           timestamptz not null default now(),
    unique (auction_id, player_id)
);

create table lots (
    id                  uuid primary key default gen_random_uuid(),
    auction_id          uuid not null references auctions(id) on delete cascade,
    auction_player_id   uuid not null references auction_players(id) on delete cascade,
    sequence_number     int not null,
    status              text not null default 'queued'
                          check (status in ('queued','open','closing','sold','unsold')),
    opened_at           timestamptz,
    closes_at           timestamptz,
    closed_at           timestamptz,
    current_high_bid_id uuid,
    version             int not null default 0,
    unique (auction_id, sequence_number)
);

create table bids (
    id            uuid primary key default gen_random_uuid(),
    lot_id        uuid not null references lots(id) on delete cascade,
    team_id       uuid not null references teams(id),
    amount        bigint not null,
    placed_by     uuid not null references users(id),
    placed_at     timestamptz not null default now(),
    is_voided     boolean not null default false,
    voided_reason text
);

create table audit_log (
    id            uuid primary key default gen_random_uuid(),
    org_id        uuid not null references orgs(id) on delete cascade,
    auction_id    uuid references auctions(id),
    actor_user_id uuid references users(id),
    action        text not null,
    entity_type   text,
    entity_id     uuid,
    metadata      jsonb,
    created_at    timestamptz not null default now()
);

-- Single-session enforcement: one active session per user. On each login,
-- the previous row for that user is overwritten with a new token — any
-- browser still holding the old token is treated as logged-out on its next
-- request. Deliberately a plain table (not something derived from
-- auth.sessions) so the app fully controls "what counts as the active session"
-- independent of Supabase's own session/refresh-token lifecycle.
create table active_sessions (
    user_id      uuid primary key references users(id) on delete cascade,
    session_token text not null,
    created_at   timestamptz not null default now(),
    user_agent   text
);

-- Indexes
create index idx_players_org on players(org_id);
create index idx_auction_players_auction on auction_players(auction_id);
create index idx_auction_players_status on auction_players(auction_id, status);
create index idx_lots_auction_status on lots(auction_id, status);
create index idx_bids_lot on bids(lot_id, placed_at desc);
create index idx_audit_log_org on audit_log(org_id, created_at desc);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table orgs enable row level security;
alter table users enable row level security;
alter table org_memberships enable row level security;
alter table players enable row level security;
alter table cricclubs_snapshots enable row level security;
alter table criciq_snapshots enable row level security;
alter table auctions enable row level security;
alter table auction_rulesets enable row level security;
alter table teams enable row level security;
alter table team_owners enable row level security;
alter table auction_players enable row level security;
alter table lots enable row level security;
alter table bids enable row level security;
alter table audit_log enable row level security;

create or replace function current_app_user_id() returns uuid as $$
  select id from users where auth_user_id = auth.uid()
$$ language sql stable security definer;

create or replace function current_user_org_ids() returns setof uuid as $$
  select org_id from org_memberships where user_id = current_app_user_id()
$$ language sql stable security definer;

create or replace function current_user_has_role(p_org_id uuid, p_roles text[]) returns boolean as $$
  select exists (
    select 1 from org_memberships
    where org_id = p_org_id
      and user_id = current_app_user_id()
      and role = any(p_roles)
  )
$$ language sql stable security definer;

-- Users can see their own row + fellow org members' basic rows
create policy users_self on users
  for select using (auth_user_id = auth.uid());
create policy users_self_update on users
  for update using (auth_user_id = auth.uid());
create policy users_self_insert on users
  for insert with check (auth_user_id = auth.uid());

create policy org_isolation_orgs on orgs
  for select using (id in (select current_user_org_ids()));

create policy org_isolation_memberships on org_memberships
  for select using (org_id in (select current_user_org_ids()));

create policy org_isolation_players on players
  for select using (org_id in (select current_user_org_ids()));
create policy org_admin_write_players on players
  for all using (current_user_has_role(org_id, array['org_admin']));

create policy org_isolation_cricclubs on cricclubs_snapshots
  for select using (player_id in (select id from players where org_id in (select current_user_org_ids())));

create policy org_isolation_criciq on criciq_snapshots
  for select using (player_id in (select id from players where org_id in (select current_user_org_ids())));

create policy org_isolation_auctions on auctions
  for select using (org_id in (select current_user_org_ids()));
create policy org_admin_write_auctions on auctions
  for all using (current_user_has_role(org_id, array['org_admin']));

create policy org_isolation_rulesets on auction_rulesets
  for select using (auction_id in (select id from auctions where org_id in (select current_user_org_ids())));
create policy org_admin_write_rulesets on auction_rulesets
  for all using (auction_id in (select id from auctions where current_user_has_role(org_id, array['org_admin'])));

create policy org_isolation_teams on teams
  for select using (auction_id in (select id from auctions where org_id in (select current_user_org_ids())));

create policy org_isolation_team_owners on team_owners
  for select using (team_id in (select id from teams where auction_id in (select id from auctions where org_id in (select current_user_org_ids()))));

create policy org_isolation_auction_players on auction_players
  for select using (auction_id in (select id from auctions where org_id in (select current_user_org_ids())));

create policy org_isolation_lots on lots
  for select using (auction_id in (select id from auctions where org_id in (select current_user_org_ids())));

create policy org_isolation_bids on bids
  for select using (lot_id in (select id from lots where auction_id in (select id from auctions where org_id in (select current_user_org_ids()))));
create policy owners_insert_bids on bids
  for insert with check (
    team_id in (
      select t.id from teams t
      join team_owners tow on tow.team_id = t.id
      where tow.user_id = current_app_user_id()
    )
  );

create policy org_isolation_audit on audit_log
  for select using (org_id in (select current_user_org_ids()));

-- Public read-only access to a live auction is handled via a server-side
-- API route validating auctions.public_link_token — NOT via direct RLS
-- grants to anonymous users. No anon policies are added here on purpose.
