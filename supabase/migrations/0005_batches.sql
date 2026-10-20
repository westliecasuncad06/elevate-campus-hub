-- Elevate Campus Hub — 0005 engagement batches (huddles)
--
-- New flow: a facilitator (or Campus Head) STARTS A BATCH, adds students to it (that is now how
-- attendance is recorded), records each student's engagement, then FINISHES the batch, which
-- moves it to History. Run this on top of 0001-0004 (the Supabase SQL Editor is fine).
--
-- Time semantics change: attendance_logs.time_in = when the student was added to the batch;
-- time_out = when the facilitator finished recording their engagement (how long the engagement took),
-- no longer "left the hub". The old scan-in/scan-out function is removed.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.engagement_batches (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id),
  facilitator_id uuid not null references public.profiles (id),
  batch_date date not null,                 -- campus-local day the batch was started
  batch_number int not null check (batch_number > 0),
  status text not null default 'open' check (status in ('open', 'finished')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint batches_number_unique unique (facilitator_id, batch_date, batch_number),
  constraint batches_finished_has_time check (status = 'open' or finished_at is not null)
);

create index engagement_batches_campus_date_idx on public.engagement_batches (campus_id, batch_date, status);
create index engagement_batches_open_idx on public.engagement_batches (facilitator_id) where status = 'open';

create table public.batch_students (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.engagement_batches (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attendance_log_id uuid not null references public.attendance_logs (id) on delete cascade,
  campus_id uuid not null references public.campuses (id),
  added_at timestamptz not null default now(),
  constraint batch_students_unique unique (batch_id, student_id)
);

-- A student is huddled in at most ONE batch per day (their attendance row is per day).
create unique index batch_students_one_batch_per_day on public.batch_students (attendance_log_id);
create index batch_students_batch_idx on public.batch_students (batch_id);

-- ---------------------------------------------------------------------------
-- Row level security: read-only from the app; every write goes through the functions below
-- ---------------------------------------------------------------------------
alter table public.engagement_batches enable row level security;
alter table public.batch_students enable row level security;

create or replace function public.is_batch_owner(p_batch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.engagement_batches b where b.id = p_batch and b.facilitator_id = auth.uid()
  )
$$;

create policy batches_select on public.engagement_batches for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
    or facilitator_id = auth.uid()
  );

create policy batch_students_select on public.batch_students for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
    or public.is_batch_owner(batch_id)
  );

-- Engagement is now written only through save_engagement() (it must belong to an open batch you own).
drop policy if exists engagement_insert on public.engagement_logs;
drop policy if exists engagement_update on public.engagement_logs;

-- The old scan-in / scan-out toggle is replaced by add_student_to_batch().
drop function if exists public.toggle_attendance(uuid, text, text);

-- ---------------------------------------------------------------------------
-- start_batch(): opens the next batch number for today
-- ---------------------------------------------------------------------------
create or replace function public.start_batch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_tz text;
  v_today date;
  v_number int;
  v_batch public.engagement_batches%rowtype;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role not in ('campus_head', 'facilitator') then
    raise exception 'Only a Campus Head or Facilitator can start a batch.' using errcode = '42501';
  end if;

  select coalesce(timezone, 'Asia/Manila') into v_tz from public.campuses where id = v_caller.campus_id;
  v_today := (now() at time zone coalesce(v_tz, 'Asia/Manila'))::date;

  select coalesce(max(batch_number), 0) + 1 into v_number
  from public.engagement_batches
  where facilitator_id = v_caller.id and batch_date = v_today;

  insert into public.engagement_batches (campus_id, facilitator_id, batch_date, batch_number)
  values (v_caller.campus_id, v_caller.id, v_today, v_number)
  returning * into v_batch;

  return jsonb_build_object(
    'id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'batch_date', v_batch.batch_date,
    'started_at', v_batch.started_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- add_student_to_batch(): the new "attendance". Creates today's attendance row if needed,
-- links the student to the batch, and auto-assigns them to the facilitator when unassigned.
-- ---------------------------------------------------------------------------
create or replace function public.add_student_to_batch(
  p_batch_id uuid,
  p_student_id uuid,
  p_method text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_batch public.engagement_batches%rowtype;
  v_student public.profiles%rowtype;
  v_log public.attendance_logs%rowtype;
  v_link public.batch_students%rowtype;
  v_other_batch public.engagement_batches%rowtype;
  v_other_name text;
  v_action text;
  v_assigned boolean := false;
  v_fac_id uuid;
  v_fac_gender text;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role not in ('campus_head', 'facilitator') then
    raise exception 'Only a Campus Head or Facilitator can add students to a batch.' using errcode = '42501';
  end if;

  select * into v_batch from public.engagement_batches where id = p_batch_id;
  if not found or v_batch.facilitator_id <> v_caller.id then
    raise exception 'That batch isn''t yours.' using errcode = '42501';
  end if;
  if v_batch.status <> 'open' then
    raise exception 'This batch is already finished.' using errcode = 'P0001';
  end if;

  if p_method not in ('qr', 'phone', 'email', 'manual') then
    raise exception 'Invalid entry method: %', p_method using errcode = '22023';
  end if;

  select * into v_student
  from public.profiles
  where id = p_student_id and role = 'student' and is_active;
  if not found or v_student.campus_id is distinct from v_caller.campus_id then
    raise exception 'Student not found in your campus.' using errcode = 'P0002';
  end if;

  -- Attendance for the batch's day (one row per student per day).
  insert into public.attendance_logs (campus_id, student_id, log_date, time_in, scanned_by, entry_method)
  values (v_caller.campus_id, p_student_id, v_batch.batch_date, now(), v_caller.id, p_method)
  on conflict (student_id, log_date) do nothing
  returning * into v_log;

  if not found then
    select * into v_log from public.attendance_logs
    where student_id = p_student_id and log_date = v_batch.batch_date;
  end if;

  select * into v_link from public.batch_students where attendance_log_id = v_log.id;
  if found then
    if v_link.batch_id = p_batch_id then
      v_action := 'already_in_batch';
    else
      select * into v_other_batch from public.engagement_batches where id = v_link.batch_id;
      select first_name into v_other_name from public.profiles where id = v_other_batch.facilitator_id;
      raise exception '% is already in % Batch % today.',
        v_student.first_name,
        case when v_other_batch.facilitator_id = v_caller.id then 'your' else coalesce(v_other_name, 'another facilitator') || '''s' end,
        v_other_batch.batch_number
        using errcode = 'P0001';
    end if;
  else
    insert into public.batch_students (batch_id, student_id, attendance_log_id, campus_id)
    values (p_batch_id, p_student_id, v_log.id, v_caller.campus_id);
    v_action := 'added';
  end if;

  -- First facilitator to huddle an unassigned student becomes their facilitator (Campus Head never assigns).
  if v_caller.role = 'facilitator'
     and not exists (select 1 from public.facilitator_students where student_id = p_student_id and is_active) then
    insert into public.facilitator_students (facilitator_id, student_id, campus_id, assigned_date)
    values (v_caller.id, p_student_id, v_caller.campus_id, v_batch.batch_date)
    on conflict do nothing;
    v_assigned := true;
  end if;

  select fs.facilitator_id, f.gender into v_fac_id, v_fac_gender
  from public.facilitator_students fs
  join public.profiles f on f.id = fs.facilitator_id
  where fs.student_id = p_student_id and fs.is_active;

  return jsonb_build_object(
    'action', v_action,
    'batch_number', v_batch.batch_number,
    'assigned_now', v_assigned,
    'facilitator_id', v_fac_id,
    'gender_mismatch', (v_fac_id is not null and v_fac_gender is distinct from v_student.gender),
    'log', jsonb_build_object('id', v_log.id, 'time_in', v_log.time_in, 'time_out', v_log.time_out),
    'student', jsonb_build_object(
      'id', v_student.id,
      'first_name', v_student.first_name,
      'last_name', v_student.last_name,
      'phone', v_student.phone,
      'email', v_student.email
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- save_engagement(): the 4-question assessment. Only the batch's own facilitator, only while the
-- batch is open. Saving also ends the "engaged for" timer for that student (attendance time_out).
-- ---------------------------------------------------------------------------
create or replace function public.save_engagement(
  p_attendance_log_id uuid,
  p_is_engaged boolean,
  p_heard_gospel boolean,
  p_accepted_jesus boolean,
  p_wants_dgroup boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_batch public.engagement_batches%rowtype;
  v_log public.attendance_logs%rowtype;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role not in ('campus_head', 'facilitator') then
    raise exception 'Only a Campus Head or Facilitator can record engagement.' using errcode = '42501';
  end if;

  select b.* into v_batch
  from public.batch_students bs
  join public.engagement_batches b on b.id = bs.batch_id
  where bs.attendance_log_id = p_attendance_log_id;
  if not found then
    raise exception 'That student isn''t in a batch.' using errcode = 'P0002';
  end if;
  if v_batch.facilitator_id <> v_caller.id then
    raise exception 'Only the facilitator running this batch can record engagement.' using errcode = '42501';
  end if;
  if v_batch.status <> 'open' then
    raise exception 'This batch is finished, so its history can''t be changed.' using errcode = 'P0001';
  end if;

  select * into v_log from public.attendance_logs where id = p_attendance_log_id;

  -- "No" to the first question means the rest are skipped and logged as false.
  insert into public.engagement_logs
    (attendance_log_id, student_id, facilitator_id, campus_id, is_engaged, heard_gospel, accepted_jesus, wants_dgroup)
  values
    (v_log.id, v_log.student_id, v_caller.id, v_log.campus_id, p_is_engaged,
     p_is_engaged and p_heard_gospel, p_is_engaged and p_accepted_jesus, p_is_engaged and p_wants_dgroup)
  on conflict (attendance_log_id) do update set
    facilitator_id = excluded.facilitator_id,
    is_engaged = excluded.is_engaged,
    heard_gospel = excluded.heard_gospel,
    accepted_jesus = excluded.accepted_jesus,
    wants_dgroup = excluded.wants_dgroup;

  -- First save ends the engagement timer for this student; later edits don't move it.
  update public.attendance_logs set time_out = now() where id = v_log.id and time_out is null;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_batch(): moves a completed batch to History. Refuses while any student still has no
-- engagement recorded. An empty batch is simply discarded.
-- ---------------------------------------------------------------------------
create or replace function public.finish_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_batch public.engagement_batches%rowtype;
  v_total int;
  v_pending int;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role not in ('campus_head', 'facilitator') then
    raise exception 'Only a Campus Head or Facilitator can finish a batch.' using errcode = '42501';
  end if;

  select * into v_batch from public.engagement_batches where id = p_batch_id for update;
  if not found or v_batch.facilitator_id <> v_caller.id then
    raise exception 'That batch isn''t yours.' using errcode = '42501';
  end if;
  if v_batch.status <> 'open' then
    raise exception 'This batch is already finished.' using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.batch_students where batch_id = p_batch_id;
  if v_total = 0 then
    delete from public.engagement_batches where id = p_batch_id;
    return jsonb_build_object('action', 'discarded', 'students', 0);
  end if;

  select count(*) into v_pending
  from public.batch_students bs
  left join public.engagement_logs e on e.attendance_log_id = bs.attendance_log_id
  where bs.batch_id = p_batch_id and e.id is null;
  if v_pending > 0 then
    raise exception 'Record engagement for % more student(s) before finishing this batch.', v_pending
      using errcode = 'P0001';
  end if;

  update public.engagement_batches set status = 'finished', finished_at = now() where id = p_batch_id;
  return jsonb_build_object('action', 'finished', 'students', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: attendance recorded before batches existed becomes one finished batch per
-- person per day, so History isn't empty. Runs only when there are no batches yet.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.engagement_batches) then
    insert into public.engagement_batches (campus_id, facilitator_id, batch_date, batch_number, status, started_at, finished_at)
    select a.campus_id, a.scanned_by, a.log_date, 1, 'finished', min(a.time_in), max(coalesce(a.time_out, a.time_in))
    from public.attendance_logs a
    group by a.campus_id, a.scanned_by, a.log_date;

    insert into public.batch_students (batch_id, student_id, attendance_log_id, campus_id, added_at)
    select b.id, a.student_id, a.id, a.campus_id, a.time_in
    from public.attendance_logs a
    join public.engagement_batches b
      on b.facilitator_id = a.scanned_by and b.batch_date = a.log_date and b.campus_id = a.campus_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.start_batch() from public, anon;
revoke execute on function public.add_student_to_batch(uuid, uuid, text) from public, anon;
revoke execute on function public.save_engagement(uuid, boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function public.finish_batch(uuid) from public, anon;
grant execute on function public.start_batch() to authenticated;
grant execute on function public.add_student_to_batch(uuid, uuid, text) to authenticated;
grant execute on function public.save_engagement(uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.finish_batch(uuid) to authenticated;
