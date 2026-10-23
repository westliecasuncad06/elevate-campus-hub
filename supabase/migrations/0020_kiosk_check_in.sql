-- Elevate Campus Hub — 0020 kiosk check-in by student number
--
-- Students check themselves in at a kiosk (a laptop at the entrance, signed in as the Campus Head) by typing their student
-- number (2017-05-07107) or their phone number. That records their attendance for the day; being added to a facilitator's
-- batch is a separate step, so the Campus Head can see who only attended and who was also engaged.
--
--   * attendance_logs.entry_method gets a 'student_number' value (a kiosk check-in or a facilitator typing the number).
--   * Student numbers already saved as 11 digits ("20170507107") are rewritten with their dashes, and a number can belong
--     to only one student per campus, so a number always finds one person. If two students at a campus already share a
--     number the index is skipped (and a notice says so): fix the duplicates, then create it by hand.
--   * add_student_to_batch() accepts the new entry method.

alter table public.attendance_logs drop constraint attendance_logs_entry_method_check;
alter table public.attendance_logs
  add constraint attendance_logs_entry_method_check
  check (entry_method in ('qr', 'phone', 'email', 'manual', 'import', 'student_number'));

update public.profiles
set student_number = substr(student_number, 1, 4) || '-' || substr(student_number, 5, 2) || '-' || substr(student_number, 7)
where role = 'student' and student_number ~ '^[0-9]{11}$';

do $$
begin
  if exists (
    select 1 from public.profiles
    where student_number is not null
    group by campus_id, student_number
    having count(*) > 1
  ) then
    raise notice 'Two students share a student number at one campus: profiles_student_number_per_campus was NOT created. Fix the duplicates, then run: create unique index profiles_student_number_per_campus on public.profiles (campus_id, student_number) where student_number is not null;';
  else
    create unique index if not exists profiles_student_number_per_campus
      on public.profiles (campus_id, student_number) where student_number is not null;
  end if;
end;
$$;

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

  if p_method not in ('qr', 'phone', 'email', 'manual', 'student_number') then
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
