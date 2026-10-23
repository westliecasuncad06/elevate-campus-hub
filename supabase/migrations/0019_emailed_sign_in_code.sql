-- Elevate Campus Hub — 0019 emailed sign-in code
--
-- An optional extra step for password sign-ins: the app emails a 6-digit code and the person types it. It is OFF until the
-- Super Admin turns it on (Security page), and is meant mainly for students, who don't have an authenticator app.
--
--   * A code is needed when someone signs in with email + password, unless THIS browser already passed the check within the
--     last N hours (default 5). It is needed again once those N hours are over, even in a session that is still open.
--   * "Continue with Google" is the easy login and is never asked for it; people who turned on an authenticator app use that
--     instead (it is the stronger of the two).
--   * Like the authenticator, it is enforced by the DATABASE (the same request hook as migration 0017), not only by the
--     screens: a session that has not passed the check is refused by the API, so knowing a password is not enough.
--
-- Everything here is written only by the server (service role); the app and the browser never touch these tables.

-- ---------------------------------------------------------------------------
-- Settings: one row
-- ---------------------------------------------------------------------------
create table public.security_settings (
  id boolean primary key default true check (id),
  email_code_enabled boolean not null default false,
  -- Who is asked for the emailed code.
  email_code_roles text[] not null default array['student'],
  -- How long one successful check lasts (for the session and for the browser).
  email_code_hours int not null default 5 check (email_code_hours between 1 and 168),
  -- The Super Admin must receive a test code before the step can be turned on (proves the email really arrives).
  email_test_ok_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.security_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- The codes themselves (one active code per person; only a keyed hash is stored)
-- ---------------------------------------------------------------------------
create table public.login_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- Sessions that passed the check, and until when.
create table public.session_verifications (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index session_verifications_user_idx on public.session_verifications (user_id);

-- Browsers that passed the check recently (a random token in a cookie; only its hash is stored here).
create table public.login_trust (
  token_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index login_trust_user_idx on public.login_trust (user_id);

-- Default deny: RLS on, no policies, no grants. Only the service role reads or writes these.
alter table public.security_settings enable row level security;
alter table public.login_codes enable row level security;
alter table public.session_verifications enable row level security;
alter table public.login_trust enable row level security;
revoke all on public.security_settings, public.login_codes, public.session_verifications, public.login_trust from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who needs the emailed code, and has this session passed it?
-- ---------------------------------------------------------------------------

-- Is the emailed code required for this person? (Step switched on, their role is included, and they have not chosen the
-- stronger authenticator app instead.)
create or replace function public.email_code_required_for(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((
    select s.email_code_enabled
       and p.is_active
       and p.role = any (s.email_code_roles)
       and not exists (
         select 1 from auth.mfa_factors f
         where f.user_id = p.id and f.factor_type::text = 'totp' and f.status::text = 'verified'
       )
    from public.security_settings s
    join public.profiles p on p.id = p_user
    limit 1
  ), false)
$$;

-- One round trip for the server: is it required for this person, and has this session already passed it?
create or replace function public.email_code_gate(p_user uuid, p_session uuid)
returns table (required boolean, verified boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.email_code_required_for(p_user),
    exists (
      select 1 from public.session_verifications v
      where v.session_id = p_session and v.user_id = p_user and v.expires_at > now()
    )
$$;

-- Marks a session as having passed (or re-passed) the check.
create or replace function public.email_code_pass(p_session uuid, p_user uuid, p_expires_at timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.session_verifications (session_id, user_id, verified_at, expires_at)
  values (p_session, p_user, now(), p_expires_at)
  on conflict (session_id) do update set verified_at = now(), expires_at = excluded.expires_at, user_id = excluded.user_id
$$;

-- Removes everything that has expired. Returns how many rows went. (Run by the keep-alive cron.)
create or replace function public.email_code_cleanup()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a int; b int; c int;
begin
  delete from public.login_codes where expires_at < now() - interval '1 day';
  get diagnostics a = row_count;
  delete from public.session_verifications where expires_at < now() - interval '1 day';
  get diagnostics b = row_count;
  -- The longest a check can last is 7 days.
  delete from public.login_trust where verified_at < now() - interval '8 days';
  get diagnostics c = row_count;
  return a + b + c;
end;
$$;

revoke execute on function public.email_code_required_for(uuid) from public, anon, authenticated;
revoke execute on function public.email_code_gate(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.email_code_pass(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.email_code_cleanup() from public, anon, authenticated;
grant execute on function public.email_code_required_for(uuid) to service_role;
grant execute on function public.email_code_gate(uuid, uuid) to service_role;
grant execute on function public.email_code_pass(uuid, uuid, timestamptz) to service_role;
grant execute on function public.email_code_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- The database-side rule (replaces the one from 0017): authenticator app AND emailed code
-- ---------------------------------------------------------------------------
-- A request is allowed when:
--   * the session came from Google sign-in (method "oauth"): the easy login; or
--   * (they have no verified authenticator, or the session passed it: aal2) AND
--     (the emailed code isn't required for them, or this session passed it and it hasn't run out).
create or replace function public.mfa_ok()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_uid uuid := auth.uid();
  v_session uuid;
begin
  if exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(v_claims -> 'amr') = 'array' then v_claims -> 'amr' else '[]'::jsonb end
    ) m
    where m ->> 'method' = 'oauth'
  ) then
    return true;
  end if;

  -- Authenticator app
  if coalesce(v_claims ->> 'aal', 'aal1') <> 'aal2' and exists (
    select 1 from auth.mfa_factors f
    where f.user_id = v_uid and f.factor_type::text = 'totp' and f.status::text = 'verified'
  ) then
    return false;
  end if;

  -- Emailed code
  if public.email_code_required_for(v_uid) then
    begin
      v_session := nullif(v_claims ->> 'session_id', '')::uuid;
    exception when others then
      return false;
    end;
    return exists (
      select 1 from public.session_verifications v
      where v.session_id = v_session and v.user_id = v_uid and v.expires_at > now()
    );
  end if;

  return true;
end;
$$;

grant execute on function public.mfa_ok() to authenticated;
