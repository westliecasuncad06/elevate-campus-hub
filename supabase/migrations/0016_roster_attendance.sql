-- Elevate Campus Hub — 0016 attendance recorded on the roster
--
-- A campus's attendance sheet already says who came on which Friday (green = present, red = absent) before most of those
-- students have an account. `roster_attendance` keeps that history against the roster name, so the Campus Head's Attendance
-- sheet shows it today. When the student registers and their name matches, `import_roster_attendance()` copies their
-- "present" days into real attendance records (`attendance_logs`), so the history becomes theirs: their own attendance
-- page, streaks and the campus's counts all include it.
--
-- Like the roster itself, this is filled by the import script and read by the app; nothing is written from the browser.

create table public.roster_attendance (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.roster_students(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('present', 'absent')),
  created_at timestamptz not null default now(),
  constraint roster_attendance_one_per_day unique (roster_id, log_date)
);

create index roster_attendance_campus_date_idx on public.roster_attendance (campus_id, log_date);

alter table public.roster_attendance enable row level security;

-- The Super Admin sees every campus; a Campus Head sees their own campus's roster attendance.
create policy roster_attendance_select on public.roster_attendance for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  );

revoke insert, update, delete on public.roster_attendance from authenticated, anon;

-- Attendance that came from the campus's own sheet (not a scan) is marked as an import.
alter table public.attendance_logs drop constraint attendance_logs_entry_method_check;
alter table public.attendance_logs
  add constraint attendance_logs_entry_method_check check (entry_method in ('qr', 'phone', 'email', 'manual', 'import'));

-- Copies the "present" days recorded for a roster name into the real attendance records of the student that name was
-- linked to. Safe to run again (a day that already has a record is left alone). Returns how many days were added.
-- Only the server (service role) calls this, right after a roster name has been linked to an account.
create or replace function public.import_roster_attendance(p_roster uuid, p_profile uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added int;
begin
  insert into public.attendance_logs (campus_id, student_id, log_date, time_in, scanned_by, entry_method)
  select ra.campus_id,
         p_profile,
         ra.log_date,
         -- The sheet has no times: 9:00 in the campus's own timezone.
         (ra.log_date + time '09:00') at time zone c.timezone,
         -- Nobody scanned them. scanned_by can't be empty, so it is the student; entry_method says 'import'.
         p_profile,
         'import'
  from public.roster_attendance ra
  join public.roster_students rs on rs.id = ra.roster_id and rs.claimed_by = p_profile
  join public.profiles p on p.id = p_profile and p.role = 'student' and p.campus_id = ra.campus_id
  join public.campuses c on c.id = ra.campus_id
  where ra.roster_id = p_roster
    and ra.status = 'present'
  on conflict (student_id, log_date) do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke execute on function public.import_roster_attendance(uuid, uuid) from public, anon, authenticated;
grant execute on function public.import_roster_attendance(uuid, uuid) to service_role;
