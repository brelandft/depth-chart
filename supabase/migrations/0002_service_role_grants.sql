-- Fixes: tables created via a raw CLI migration don't automatically pick up
-- Supabase's usual "service_role gets full access" grants — that behavior
-- is tied to tables created through the dashboard/Management API, not plain
-- CREATE TABLE. This grants what should have been granted in 0001, and sets
-- a default so every FUTURE migration-created table in this schema gets it
-- automatically too (relevant once the accounts/streaks tables show up).

grant usage on schema public to service_role;

grant select, insert, update, delete on public.kv_store to service_role;
grant select, insert, update, delete on public.pick_counts to service_role;
grant execute on function public.increment_pick(text, text, text, text) to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
