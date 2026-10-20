-- Elevate Campus Hub — 0013 facilitators can work at several campuses
--
-- A facilitator is not tied to one school: they also go to others, each of which has its own Campus Head. So a
-- facilitator can work at several campuses. Campus Heads and students still belong to exactly one.
--
-- How it fits with everything that already works:
--   * profiles.campus_id stays "the campus I am working at right now". Every batch, attendance, row-level-security
--     rule and page already reads it, so they keep working unchanged, for whichever campus the facilitator is at.
--   * profile_campuses lists the OTHER campuses a facilitator also works at. A facilitator can work at their current
--     campus plus those, and switches between them with switch_my_campus() (the Super Admin sets the list).
--   * A Campus Head sees the facilitators who work at their campus even while those are set to another one, and a
--     facilitator keeps seeing (and can chat with) the students assigned to them at any of their campuses.

create table public.profile_campuses (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  campus_id uuid not null references public.campuses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, campus_id)
);

create index profile_campuses_campus_idx on public.profile_campuses (campus_id);

alter table public.profile_campuses enable row level security;

-- You see your own list; the Super Admin sees all; a Campus Head sees who is listed for their campus.
create policy profile_campuses_select on public.profile_campuses for select to authenticated
  using (
    profile_id = auth.uid()
    or public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  );

-- Nothing is written from the app directly: only admin_move_user() and switch_my_campus() below change it.
revoke insert, update, delete on public.profile_campuses from authenticated, anon;

-- Does this person work at this campus (it is their current one, or one of their extra ones)?
create or replace function public.works_at(p_user uuid, p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.campus_id = p_campus)
      or exists (select 1 from public.profile_campuses pc where pc.profile_id = p_user and pc.campus_id = p_campus)
$$;

revoke execute on function public.works_at(uuid, uuid) from public, anon;
grant execute on function public.works_at(uuid, uuid) to authenticated;

-- Same-gender chat: unchanged, except the facilitator only needs to WORK AT the student's campus, not be set to it.
create or replace function public.can_chat(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.facilitator_students fs
    join public.profiles f on f.id = fs.facilitator_id
    join public.profiles s on s.id = fs.student_id
    where fs.is_active
      and f.is_active and s.is_active
      and f.role = 'facilitator' and s.role = 'student'
      and f.gender is not null and f.gender = s.gender
      and public.works_at(f.id, s.campus_id)
      and ((fs.facilitator_id = p_a and fs.student_id = p_b)
        or (fs.facilitator_id = p_b and fs.student_id = p_a))
  )
$$;

-- profiles: the same rules as 0010, plus two things that follow from facilitators working at several campuses.
drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.auth_role() = 'super_admin'
    -- Campus Head sees everyone in the campus; facilitators see the campus's students.
    or (
      campus_id = public.auth_campus_id()
      and (
        public.auth_role() = 'campus_head'
        or (public.auth_role() = 'facilitator' and role = 'student')
      )
    )
    -- A Campus Head also sees the facilitators who work at their campus while currently set to another one.
    or (
      public.auth_role() = 'campus_head'
      and role = 'facilitator'
      and exists (
        select 1 from public.profile_campuses pc
        where pc.profile_id = profiles.id and pc.campus_id = public.auth_campus_id()
      )
    )
    -- A facilitator sees the students assigned to them, at whichever of their campuses the student is.
    or (
      public.auth_role() = 'facilitator'
      and role = 'student'
      and id in (
        select fs.student_id from public.facilitator_students fs
        where fs.facilitator_id = auth.uid() and fs.is_active
      )
    )
  );

-- A Campus Head sees the weekly availability of everyone who works at their campus.
drop policy availability_select on public.facilitator_availability;

create policy availability_select on public.facilitator_availability for select to authenticated
  using (
    facilitator_id = auth.uid()
    or public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and public.works_at(facilitator_id, public.auth_campus_id()))
    or facilitator_id in (
      select fs.facilitator_id from public.facilitator_students fs
      where fs.student_id = auth.uid() and fs.is_active
    )
  );

-- ---------------------------------------------------------------------------
-- The campuses the signed-in facilitator works at (for the switcher in the header)
-- ---------------------------------------------------------------------------
create or replace function public.my_campuses()
returns table (id uuid, code text, name text, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code, c.name, (c.id = p.campus_id) as is_current
  from public.profiles p
  join public.campuses c
    on c.id = p.campus_id
    or c.id in (select pc.campus_id from public.profile_campuses pc where pc.profile_id = p.id)
  where p.id = auth.uid() and p.role = 'facilitator' and p.is_active and c.is_active
  order by is_current desc, c.code
$$;

revoke execute on function public.my_campuses() from public, anon;
grant execute on function public.my_campuses() to authenticated;

-- ---------------------------------------------------------------------------
-- A facilitator switches which of their campuses they are working at
-- ---------------------------------------------------------------------------
create or replace function public.switch_my_campus(p_campus uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles%rowtype;
begin
  select * into v from public.profiles where id = auth.uid() and is_active for update;
  if not found or v.role <> 'facilitator' then
    raise exception 'Only facilitators can switch campus.';
  end if;

  if v.campus_id = p_campus then
    return jsonb_build_object('changed', false);
  end if;
  if not exists (
    select 1
    from public.profile_campuses pc
    join public.campuses c on c.id = pc.campus_id
    where pc.profile_id = v.id and pc.campus_id = p_campus and c.is_active
  ) then
    raise exception 'You don''t work at that campus.';
  end if;
  -- A batch belongs to the campus it was started at, so it has to be finished before moving on.
  if exists (select 1 from public.engagement_batches where facilitator_id = v.id and status = 'open') then
    raise exception 'Finish your open batch first, then switch campus.';
  end if;

  update public.profiles set campus_id = p_campus where id = v.id;
  -- Keep the list "every campus except the current one".
  delete from public.profile_campuses where profile_id = v.id and campus_id = p_campus;
  insert into public.profile_campuses (profile_id, campus_id) values (v.id, v.campus_id) on conflict do nothing;

  return jsonb_build_object('changed', true);
end;
$$;

revoke execute on function public.switch_my_campus(uuid) from public, anon;
grant execute on function public.switch_my_campus(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Super Admin: move someone / change their role / set the campuses a facilitator works at
-- (replaces the 3-argument version from 0012; callers that pass three arguments keep working)
-- ---------------------------------------------------------------------------
drop function public.admin_move_user(uuid, text, uuid);

create function public.admin_move_user(p_user uuid, p_role text, p_campus uuid, p_extra uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profiles%rowtype;
  v_extras uuid[];
  v_old uuid[];
  v_new uuid[];
  v_removed uuid[];
  v_ended int := 0;
begin
  select * into v from public.profiles where id = p_user for update;
  if not found then raise exception 'That person could not be found.'; end if;

  if v.role = 'super_admin' then
    raise exception 'A Super Admin''s role and campus can''t be changed here.';
  end if;
  if p_role not in ('campus_head', 'facilitator', 'student') then
    raise exception 'Pick Campus Head, Facilitator or Student.';
  end if;
  if (v.role = 'student') <> (p_role = 'student') then
    raise exception 'A student can''t become staff (or the other way round). Create a new account instead.';
  end if;
  if not exists (select 1 from public.campuses where id = p_campus and is_active) then
    raise exception 'Pick an active campus.';
  end if;
  if p_role in ('facilitator', 'student') and v.gender is null then
    raise exception 'Set their gender first: it decides who they can chat with.';
  end if;

  -- Only facilitators work at several campuses; for everyone else the extra list is ignored.
  v_extras := case
    when p_role = 'facilitator'
      then array(select distinct e from unnest(coalesce(p_extra, '{}'::uuid[])) e where e is not null and e <> p_campus)
    else '{}'::uuid[]
  end;
  if exists (select 1 from unnest(v_extras) e where not exists (select 1 from public.campuses c where c.id = e and c.is_active)) then
    raise exception 'Every campus must be an active campus.';
  end if;

  v_old := array(
    select distinct c from (
      select v.campus_id as c
      union all
      select campus_id from public.profile_campuses where profile_id = p_user
    ) s where c is not null
  );
  v_new := array_append(v_extras, p_campus);
  v_removed := array(select o from unnest(v_old) o where not (o = any (v_new)));

  if v.role = p_role
     and v.campus_id is not distinct from p_campus
     and cardinality(v_removed) = 0
     and not exists (select 1 from unnest(v_new) n where not (n = any (v_old))) then
    return jsonb_build_object('changed', false, 'ended_assignments', 0);
  end if;

  -- Changing role, current campus, or dropping a campus needs their batches finished. Only ADDING a campus doesn't.
  if v.role <> p_role or v.campus_id is distinct from p_campus or cardinality(v_removed) > 0 then
    if exists (select 1 from public.engagement_batches where facilitator_id = p_user and status = 'open') then
      raise exception '% has an open batch. Finish it first, then move them.', v.first_name;
    end if;
    if exists (
      select 1
      from public.batch_students bs
      join public.engagement_batches b on b.id = bs.batch_id
      where bs.student_id = p_user and b.status = 'open'
    ) then
      raise exception '% is in a batch that is still open. Finish the batch first, then move them.', v.first_name;
    end if;
  end if;

  -- Assignments only make sense inside one campus and one role.
  if v.role <> p_role then
    update public.facilitator_students set is_active = false
    where is_active and (facilitator_id = p_user or student_id = p_user);
    get diagnostics v_ended = row_count;
  elsif v.role = 'student' then
    if v.campus_id is distinct from p_campus then
      update public.facilitator_students set is_active = false where is_active and student_id = p_user;
      get diagnostics v_ended = row_count;
    end if;
  else
    -- Staff keep working with the students of every campus they still work at; only those of a campus dropped end.
    update public.facilitator_students set is_active = false
    where is_active and facilitator_id = p_user and campus_id = any (v_removed);
    get diagnostics v_ended = row_count;
  end if;

  update public.profiles set role = p_role, campus_id = p_campus where id = p_user;
  delete from public.profile_campuses where profile_id = p_user;
  insert into public.profile_campuses (profile_id, campus_id) select p_user, e from unnest(v_extras) e;

  return jsonb_build_object('changed', true, 'ended_assignments', v_ended, 'campuses', cardinality(v_new));
end;
$$;

revoke execute on function public.admin_move_user(uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.admin_move_user(uuid, text, uuid, uuid[]) to service_role;
