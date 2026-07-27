-- Any Given Player — shared state
-- Mirrors what the Cloudflare KV design was doing, but as real relational
-- tables: pick_counts gets an atomic per-row increment instead of a
-- read-modify-write blob, which is a genuine concurrency fix, not just a
-- lateral move from KV.

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists pick_counts (
  league      text not null,
  team        text not null,
  position    text not null,
  player_key  text not null,
  count       bigint not null default 0,
  primary key (league, team, position, player_key)
);

create index if not exists idx_pick_counts_slot
  on pick_counts (league, team, position);

-- RLS on, no policies: the anon/public API key gets zero access to these
-- tables. Only the service_role key — used exclusively inside the Edge
-- Functions, never shipped to the client — can read or write them. All
-- reads/writes from the game go through /pick, /get, /set, which apply
-- the actual game rules (fuzzy match, dpick: guard, etc).
alter table kv_store enable row level security;
alter table pick_counts enable row level security;

-- Atomic increment: two simultaneous picks on the same player can no
-- longer clobber each other's count, unlike the old KV read-modify-write.
create or replace function increment_pick(
  p_league text, p_team text, p_position text, p_player_key text
) returns void
language sql
as $$
  insert into pick_counts (league, team, position, player_key, count)
  values (p_league, p_team, p_position, p_player_key, 1)
  on conflict (league, team, position, player_key)
  do update set count = pick_counts.count + 1;
$$;

-- Note: the old Cloudflare /set had a 10-day TTL on date-suffixed keys
-- (e.g. daily score ledgers). Postgres has no native per-row TTL — this
-- table will just grow slowly instead. Not a real problem at this scale
-- (a niche daily game's score ledger is tiny), but worth a cleanup job
-- via pg_cron later if kv_store ever gets large.
