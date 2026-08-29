create table if not exists active_sessions (
    user_id       uuid primary key references users(id) on delete cascade,
    session_token text not null,
    created_at    timestamptz not null default now(),
    user_agent    text
);

alter table active_sessions enable row level security;

drop policy if exists own_session on active_sessions;

create policy own_session on active_sessions
  for all using (user_id = (select id from users where auth_user_id = auth.uid()));