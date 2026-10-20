-- Elevate Campus Hub — 0015 campus student roster
--
-- A campus can already have a list of its students (an attendance sheet) before any of them has an account. The roster
-- holds those names. When a student is registered with a matching name, the roster entry is linked to the new account
-- (`claimed_by`), so the campus can see who still hasn't registered and nobody is entered twice.
--
-- Names are compared by `name_key`: the words of the name, lower-cased, without accents, initials or suffixes, sorted
-- (so "Abordo, Irish Nicole" and "Irish Nicole Abordo" are the same). See src/lib/roster.ts.
--
-- The roster is filled by the import script and linked by the server (service role); the app only reads it.

create table public.roster_students (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  name_key text not null check (char_length(name_key) between 1 and 200),
  gender text check (gender in ('male', 'female')),
  year_level int check (year_level between 1 and 10),
  course text check (char_length(course) <= 80),
  -- The account this name was matched to. Deleting the account frees the name again.
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One entry per person per campus; an account can be linked to only one roster name.
create unique index roster_students_campus_key_idx on public.roster_students (campus_id, name_key);
create unique index roster_students_claimed_by_idx on public.roster_students (claimed_by) where claimed_by is not null;

alter table public.roster_students enable row level security;

-- The Super Admin sees every roster; a Campus Head and the facilitators who work at the campus see theirs.
create policy roster_students_select on public.roster_students for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
    or (public.auth_role() = 'facilitator' and public.works_at(auth.uid(), campus_id))
  );

-- Nothing is written from the app directly (the server uses the service role).
revoke insert, update, delete on public.roster_students from authenticated, anon;
