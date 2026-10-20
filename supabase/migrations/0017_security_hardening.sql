-- Elevate Campus Hub — 0017 security hardening
--
-- 1. Rate limiting (brute-force passwords, code guessing, bots, email flooding): counters kept in the database, because
--    the app runs on serverless functions that share no memory. Only the server (service role) touches them.
-- 2. Two-step verification (an authenticator-app code) for people who sign in with email + password.
--    The app checks it in the browser flow, but that alone is not enough: the database address and key are public, so
--    someone who knows a password could skip the app and call the database API directly. So the DATABASE refuses
--    requests from a password-only session of anyone who turned two-step on (`enforce_mfa`, run by the API before every
--    request) and Realtime subscriptions get the same rule through restrictive policies.
--    Signing in with Google counts as strong enough ("easy login"), so those sessions are let through.

-- ---------------------------------------------------------------------------
-- 1. Rate limits
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

-- Default deny: no policies, no grants. Only the service role (which bypasses RLS) reads or writes.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one attempt for `p_key` in a fixed window and says whether it is still allowed.
-- Atomic (one statement), so many requests at once can't slip past the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, hits int, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning * into v_row;

  allowed := v_row.hits <= p_limit;
  hits := v_row.hits;
  retry_after := greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - now())))::int);
  return next;
end;
$$;

-- Takes one attempt back (a successful sign-in doesn't count against the shared "this address" counter, so a whole
-- class signing in from one Wi-Fi isn't locked out by each other).
create or replace function public.rate_limit_refund(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rate_limits set hits = greatest(hits - 1, 0) where key = p_key
$$;

-- Forgets a counter (a successful sign-in clears that person's failed attempts).
create or replace function public.rate_limit_reset(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where key = p_key
$$;

-- Housekeeping: counters whose window ended long ago are of no use any more. Returns how many were removed.
create or replace function public.rate_limits_cleanup()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.rate_limit_reset(text) from public, anon, authenticated;
revoke execute on function public.rate_limit_refund(text) from public, anon, authenticated;
revoke execute on function public.rate_limits_cleanup() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.rate_limit_reset(text) to service_role;
grant execute on function public.rate_limit_refund(text) to service_role;
grant execute on function public.rate_limits_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Two-step verification
-- ---------------------------------------------------------------------------

-- Kept in step with the real factor by the server, so the app doesn't have to ask Supabase on every page.
-- (The database never trusts this column: mfa_ok() below looks at the real factors.)
alter table public.profiles add column mfa_enabled boolean not null default false;

-- Is this request allowed to use the data? Yes when:
--   * the person has no verified authenticator factor (two-step is off), or
--   * the session has passed the second step (the token says aal2), or
--   * the session came from Google sign-in (method "oauth"), which is the "easy login".
-- A password-only session of someone who turned two-step on is NOT allowed.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.factor_type::text = 'totp' and f.status::text = 'verified'
    )
    or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
      ) m
      where m ->> 'method' = 'oauth'
    )
$$;

grant execute on function public.mfa_ok() to authenticated;

-- Run by the database API before EVERY request (see the end of this file). Signed-out requests and the server's own
-- service-role requests carry no user id and pass straight through.
create or replace function public.enforce_mfa()
returns void
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null and not public.mfa_ok() then
    raise exception 'Two-step verification is required for this account.' using errcode = 'PT403';
  end if;
end;
$$;

grant execute on function public.enforce_mfa() to anon, authenticated, service_role;

-- Realtime does not go through the API request hook, so tables that are broadcast (chat, notifications…) get a
-- restrictive policy too: on top of the normal policies, the session must also pass mfa_ok().
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t.tablename || '_mfa_required', t.schemaname, t.tablename
    );
  end loop;
end $$;

-- Switch the API request hook on (Supabase's API reads this setting; a plain Postgres database has no such role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.enforce_mfa''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end $$;
