-- Elevate Campus Hub — 0008 Google Form report fields + attendance sheet helpers
--
-- 1. The ministry's "Elevate Engagement Report" Google Form asks for a "School/Location" that the system did not have:
--      campuses.report_location   default School/Location text for that campus
--      campuses.google_form_url   the campus's Google Form link (the app reads the form's fields from it and submits)
--      daily_reports.location     School/Location for one specific report (defaults to the campus value, editable)
-- 2. Two read-only functions that feed the Campus Head's attendance sheet (one row per student, not one per visit,
--    so a big campus stays under the API's 1000-row page limit).

alter table public.campuses
  add column google_form_url text,
  add column report_location text;

alter table public.daily_reports
  add column location text;

-- Which days each student attended within a date range. SECURITY INVOKER: RLS limits it to the viewer's campus.
create or replace function public.attendance_dates_by_student(p_campus_id uuid, p_from date, p_to date)
returns table (student_id uuid, dates date[])
language sql
stable
as $$
  select a.student_id, array_agg(distinct a.log_date order by a.log_date)
  from public.attendance_logs a
  where a.campus_id = p_campus_id and a.log_date between p_from and p_to
  group by a.student_id
$$;

-- The days the campus actually met (at least one student was recorded), oldest first.
create or replace function public.attendance_session_dates(p_campus_id uuid, p_from date, p_to date)
returns setof date
language sql
stable
as $$
  select distinct a.log_date
  from public.attendance_logs a
  where a.campus_id = p_campus_id and a.log_date between p_from and p_to
  order by 1
$$;
