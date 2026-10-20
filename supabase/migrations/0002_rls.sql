-- Elevate Campus Hub — 0002 row level security
--
-- Model:
--   * Every table has RLS enabled (default deny).
--   * Reads/ordinary writes go through the signed-in user's session and are limited here.
--   * Account creation / password resets / cron / webhook logging use the service-role key
--     on the server (it bypasses RLS) after the server action checked the caller's role.
--   * Attendance is written only through public.toggle_attendance() (0003).

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies on profiles cannot recurse)
-- ---------------------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.auth_campus_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select campus_id from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.campus_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select campus_id from public.profiles where id = p_user
$$;

-- Same-gender chat rule: an active facilitator<->student assignment exists, both are
-- active, in the same campus, with the same gender.
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
      and f.campus_id = s.campus_id
      and ((fs.facilitator_id = p_a and fs.student_id = p_b)
        or (fs.facilitator_id = p_b and fs.student_id = p_a))
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.campuses enable row level security;
alter table public.programs enable row level security;
alter table public.profiles enable row level security;
alter table public.facilitator_students enable row level security;
alter table public.facilitator_availability enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.engagement_logs enable row level security;
alter table public.daily_reports enable row level security;
alter table public.report_submissions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.system_logs enable row level security;

-- ---------------------------------------------------------------------------
-- campuses: Super Admin full; everyone else reads own campus
-- ---------------------------------------------------------------------------
create policy campuses_select on public.campuses for select to authenticated
  using (public.auth_role() = 'super_admin' or id = public.auth_campus_id());

create policy campuses_admin_write on public.campuses for all to authenticated
  using (public.auth_role() = 'super_admin')
  with check (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- programs: Super Admin full; others read global + own campus programs
-- ---------------------------------------------------------------------------
create policy programs_select on public.programs for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() is not null and (campus_id is null or campus_id = public.auth_campus_id()))
  );

create policy programs_admin_write on public.programs for all to authenticated
  using (public.auth_role() = 'super_admin')
  with check (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- profiles: read-only through RLS. All profile writes go through server actions
-- that use the service-role key after checking the caller's role.
-- ---------------------------------------------------------------------------
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
    -- A student sees their assigned facilitator.
    or id in (
      select fs.facilitator_id from public.facilitator_students fs
      where fs.student_id = auth.uid() and fs.is_active
    )
  );

-- ---------------------------------------------------------------------------
-- facilitator_students
-- ---------------------------------------------------------------------------
create policy fs_select on public.facilitator_students for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
    or facilitator_id = auth.uid()
    or student_id = auth.uid()
  );

create policy fs_campus_head_write on public.facilitator_students for all to authenticated
  using (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  with check (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id());

-- ---------------------------------------------------------------------------
-- facilitator_availability
-- ---------------------------------------------------------------------------
create policy availability_select on public.facilitator_availability for select to authenticated
  using (
    facilitator_id = auth.uid()
    or public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and public.campus_of(facilitator_id) = public.auth_campus_id())
    or facilitator_id in (
      select fs.facilitator_id from public.facilitator_students fs
      where fs.student_id = auth.uid() and fs.is_active
    )
  );

-- Facilitators and Campus Heads manage their own weekly schedule.
create policy availability_own_write on public.facilitator_availability for all to authenticated
  using (facilitator_id = auth.uid() and public.auth_role() in ('facilitator', 'campus_head'))
  with check (facilitator_id = auth.uid() and public.auth_role() in ('facilitator', 'campus_head'));

-- ---------------------------------------------------------------------------
-- attendance_logs: read only; writes via toggle_attendance()
-- ---------------------------------------------------------------------------
create policy attendance_select on public.attendance_logs for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() in ('campus_head', 'facilitator') and campus_id = public.auth_campus_id())
    or student_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- engagement_logs: Campus Head + facilitators of the campus. Students never see these.
-- ---------------------------------------------------------------------------
create policy engagement_select on public.engagement_logs for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() in ('campus_head', 'facilitator') and campus_id = public.auth_campus_id())
  );

create policy engagement_insert on public.engagement_logs for insert to authenticated
  with check (
    public.auth_role() in ('campus_head', 'facilitator')
    and campus_id = public.auth_campus_id()
    and facilitator_id = auth.uid()
    and exists (
      select 1 from public.attendance_logs a
      where a.id = attendance_log_id
        and a.student_id = engagement_logs.student_id
        and a.campus_id = engagement_logs.campus_id
    )
  );

create policy engagement_update on public.engagement_logs for update to authenticated
  using (
    public.auth_role() in ('campus_head', 'facilitator')
    and campus_id = public.auth_campus_id()
  )
  with check (
    public.auth_role() in ('campus_head', 'facilitator')
    and campus_id = public.auth_campus_id()
    and facilitator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- daily_reports: Campus Head full for own campus; Super Admin read-only
-- ---------------------------------------------------------------------------
create policy daily_reports_select on public.daily_reports for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  );

create policy daily_reports_campus_head_write on public.daily_reports for all to authenticated
  using (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  with check (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id());

-- ---------------------------------------------------------------------------
-- report_submissions
-- ---------------------------------------------------------------------------
create policy submissions_select on public.report_submissions for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  );

create policy submissions_campus_head_write on public.report_submissions for all to authenticated
  using (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  with check (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id());

-- ---------------------------------------------------------------------------
-- chat_messages: strictly same-gender, assigned facilitator <-> student
-- ---------------------------------------------------------------------------
create policy chat_select on public.chat_messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy chat_insert on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and campus_id = public.auth_campus_id()
    and public.can_chat(sender_id, receiver_id)
  );

create policy chat_mark_read on public.chat_messages for update to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

-- The receiver may only flip is_read; the message text is immutable.
revoke update on public.chat_messages from authenticated, anon;
grant update (is_read) on public.chat_messages to authenticated;
revoke delete on public.chat_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- system_logs: Super Admin read-only (the server writes with the service-role key)
-- ---------------------------------------------------------------------------
create policy system_logs_select on public.system_logs for select to authenticated
  using (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- Realtime: stream new chat messages (RLS still applies to subscribers)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
     ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
