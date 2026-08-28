-- Run this against your EXISTING seeded database — it only adds a new
-- table, nothing else changes, so your org/teams/players/auction data is
-- untouched. Supabase dashboard -> SQL Editor -> paste -> Run.

create table if not exists active_sessions (
    user_id       uuid primary key references users(id) on delete cascade,
    session_token text not null,
    created_at    timestamptz not null default now(),
    user_agent    text
);

alter table active_sessions enable row level security;

-- A user can only see/manage their own session row.
create policy if not exists own_session on active_sessions
  for all using (user_id = (select id from users where auth_user_id = auth.uid()));
