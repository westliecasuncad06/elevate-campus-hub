-- Elevate Campus Hub — 0003 business-logic functions

-- ---------------------------------------------------------------------------
-- toggle_attendance
--   Scan #1 of the campus-local day -> time_in
--   Scan #2                         -> time_out
--   Scan #3+                        -> 'already_completed' (nothing changes)
--   Also auto-assigns the student to the scanning facilitator when the student has
--   no active facilitator yet (Campus Head scans never assign).
-- ---------------------------------------------------------------------------
create or replace function public.toggle_attendance(
  p_student_id uuid,
  p_method text default 'qr',
  p_purpose text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller public.profiles%rowtype;
  v_student public.profiles%rowtype;
  v_tz text;
  v_today date;
  v_log public.attendance_logs%rowtype;
  v_action text;
  v_assigned boolean := false;
  v_fac_id uuid;
  v_fac_gender text;
begin
  select * into v_caller from public.profiles where id = auth.uid() and is_active;
  if not found or v_caller.role not in ('campus_head', 'facilitator') then
    raise exception 'Only a Campus Head or Facilitator can mark attendance.' using errcode = '42501';
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

  select coalesce(timezone, 'Asia/Manila') into v_tz from public.campuses where id = v_caller.campus_id;
  v_today := (now() at time zone coalesce(v_tz, 'Asia/Manila'))::date;

  insert into public.attendance_logs (campus_id, student_id, log_date, time_in, purpose, scanned_by, entry_method)
  values (v_caller.campus_id, p_student_id, v_today, now(), p_purpose, v_caller.id, p_method)
  on conflict (student_id, log_date) do nothing
  returning * into v_log;

  if found then
    v_action := 'time_in';
  else
    select * into v_log
    from public.attendance_logs
    where student_id = p_student_id and log_date = v_today
    for update;

    if v_log.time_out is null then
      update public.attendance_logs set time_out = now() where id = v_log.id returning * into v_log;
      v_action := 'time_out';
    else
      v_action := 'already_completed';
    end if;
  end if;

  -- Auto-assignment: first facilitator to take the student's attendance becomes their facilitator.
  if v_caller.role = 'facilitator'
     and not exists (
       select 1 from public.facilitator_students where student_id = p_student_id and is_active
     ) then
    insert into public.facilitator_students (facilitator_id, student_id, campus_id, assigned_date)
    values (v_caller.id, p_student_id, v_caller.campus_id, v_today)
    on conflict do nothing;
    v_assigned := true;
  end if;

  select fs.facilitator_id, f.gender into v_fac_id, v_fac_gender
  from public.facilitator_students fs
  join public.profiles f on f.id = fs.facilitator_id
  where fs.student_id = p_student_id and fs.is_active;

  return jsonb_build_object(
    'action', v_action,
    'assigned_now', v_assigned,
    'facilitator_id', v_fac_id,
    'gender_mismatch', (v_fac_id is not null and v_fac_gender is distinct from v_student.gender),
    'log', jsonb_build_object(
      'id', v_log.id,
      'log_date', v_log.log_date,
      'time_in', v_log.time_in,
      'time_out', v_log.time_out,
      'entry_method', v_log.entry_method
    ),
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

revoke execute on function public.toggle_attendance(uuid, text, text) from public, anon;
grant execute on function public.toggle_attendance(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- compute_daily_report — the spec's section 5.4 auto-calculations.
-- SECURITY INVOKER: RLS applies, so a Campus Head only ever aggregates their own campus.
-- ---------------------------------------------------------------------------
create or replace function public.compute_daily_report(p_campus_id uuid, p_date date)
returns table (
  total_attendance int,
  students_engaged int,
  students_heard_gospel int,
  students_accepted_jesus int,
  students_wants_dgroup int,
  volunteers_count int
)
language sql
stable
as $$
  select
    (select count(distinct a.student_id)::int
       from public.attendance_logs a
      where a.campus_id = p_campus_id and a.log_date = p_date),
    (select count(distinct e.student_id)::int
       from public.engagement_logs e
       join public.attendance_logs a on a.id = e.attendance_log_id
      where a.campus_id = p_campus_id and a.log_date = p_date and e.is_engaged),
    (select count(distinct e.student_id)::int
       from public.engagement_logs e
       join public.attendance_logs a on a.id = e.attendance_log_id
      where a.campus_id = p_campus_id and a.log_date = p_date and e.heard_gospel),
    (select count(distinct e.student_id)::int
       from public.engagement_logs e
       join public.attendance_logs a on a.id = e.attendance_log_id
      where a.campus_id = p_campus_id and a.log_date = p_date and e.accepted_jesus),
    (select count(distinct e.student_id)::int
       from public.engagement_logs e
       join public.attendance_logs a on a.id = e.attendance_log_id
      where a.campus_id = p_campus_id and a.log_date = p_date and e.wants_dgroup),
    (select count(distinct a.scanned_by)::int
       from public.attendance_logs a
       join public.profiles p on p.id = a.scanned_by
      where a.campus_id = p_campus_id and a.log_date = p_date and p.role = 'facilitator')
$$;

-- ---------------------------------------------------------------------------
-- range_report_summary — totals for a date range, used for Google submissions.
-- Student figures are the sum of the saved daily reports (so Campus Head edits count);
-- volunteers are the DISTINCT facilitators across the whole range.
-- ---------------------------------------------------------------------------
create or replace function public.range_report_summary(p_campus_id uuid, p_from date, p_to date)
returns table (
  days_with_report int,
  total_attendance int,
  students_engaged int,
  students_heard_gospel int,
  students_accepted_jesus int,
  students_wants_dgroup int,
  volunteers_count int
)
language sql
stable
as $$
  select
    count(*)::int,
    coalesce(sum(d.total_attendance), 0)::int,
    coalesce(sum(d.students_engaged), 0)::int,
    coalesce(sum(d.students_heard_gospel), 0)::int,
    coalesce(sum(d.students_accepted_jesus), 0)::int,
    coalesce(sum(d.students_wants_dgroup), 0)::int,
    (select count(distinct a.scanned_by)::int
       from public.attendance_logs a
       join public.profiles p on p.id = a.scanned_by
      where a.campus_id = p_campus_id
        and a.log_date between p_from and p_to
        and p.role = 'facilitator')
  from public.daily_reports d
  where d.campus_id = p_campus_id and d.report_date between p_from and p_to
$$;
