-- Elevate Campus Hub — 0018 a lock that lasts a full window from the moment the limit is reached
--
-- With a fixed window, "4 wrong passwords, then wait 60 seconds" would count the 60 seconds from the FIRST wrong password,
-- so someone who took 20 seconds over their 4 tries would only wait 40 more. `p_restart_at_limit` makes the window start
-- again at the attempt that reaches the limit, so the wait is always the full time, counted from that 4th wrong try.

drop function if exists public.rate_limit_hit(text, int, int);

create or replace function public.rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int,
  p_restart_at_limit boolean default false
)
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

  -- The attempt that uses up the last allowed try starts the lock clock.
  if p_restart_at_limit and v_row.hits = p_limit then
    update public.rate_limits set window_start = now() where key = p_key returning * into v_row;
  end if;

  allowed := v_row.hits <= p_limit;
  hits := v_row.hits;
  retry_after := greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - now())))::int);
  return next;
end;
$$;

revoke execute on function public.rate_limit_hit(text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int, boolean) to service_role;
