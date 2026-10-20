-- Elevate Campus Hub — 0006 in-app notifications
--
-- Every notification belongs to ONE person, carries the app path to open when it is clicked (`link`),
-- and is created by the database itself (triggers), so it works no matter which screen caused the event.
-- Repeated events from the same source (for example several chat messages from one person) collapse into
-- one unread notification with a counter instead of flooding the bell.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  campus_id uuid references public.campuses (id),
  type text not null check (type in ('chat', 'assignment', 'attendance', 'batch', 'engagement', 'invitation', 'system')),
  title text not null,
  body text,
  -- App-relative path (never a full URL), so a notification can't send anyone off-site.
  link text not null,
  -- Collapses repeats while unread, for example "chat:<sender id>".
  group_key text,
  count int not null default 1 check (count > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_link_relative check (link like '/%' and link not like '//%')
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where not is_read;
create unique index notifications_one_unread_per_group
  on public.notifications (recipient_id, group_key) where group_key is not null and not is_read;

-- ---------------------------------------------------------------------------
-- Row level security: you only ever see and update your own notifications
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Only is_read can change from the app; nothing is created or deleted from the app.
revoke update on public.notifications from authenticated, anon;
grant update (is_read) on public.notifications to authenticated;
revoke insert, delete on public.notifications from authenticated, anon;

-- Live updates for the bell (RLS still applies to subscribers).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- notify(): the one way a notification is created (not callable from the app)
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_recipient uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text,
  p_group text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus uuid;
  v_previous int;
begin
  select campus_id into v_campus from public.profiles where id = p_recipient and is_active;
  if not found then
    return;
  end if;

  -- Replace the previous unread one from the same source with a fresh row (so listeners see an
  -- INSERT) and carry the counter forward.
  if p_group is not null then
    delete from public.notifications
    where recipient_id = p_recipient and group_key = p_group and not is_read
    returning count into v_previous;
  end if;

  insert into public.notifications (recipient_id, campus_id, type, title, body, link, group_key, count)
  values (p_recipient, v_campus, p_type, p_title, p_body, p_link, p_group, coalesce(v_previous, 0) + 1);
end;
$$;

create or replace function public.notify_campus_heads(
  p_campus uuid,
  p_except uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_head uuid;
begin
  for v_head in
    select id from public.profiles
    where role = 'campus_head' and campus_id = p_campus and is_active and id is distinct from p_except
  loop
    perform public.notify(v_head, p_type, p_title, p_body, p_link);
  end loop;
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_campus_heads(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chat: tell the other person (opens that conversation)
-- ---------------------------------------------------------------------------
create or replace function public.trg_chat_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender public.profiles%rowtype;
  v_receiver public.profiles%rowtype;
  v_link text;
begin
  select * into v_sender from public.profiles where id = new.sender_id;
  select * into v_receiver from public.profiles where id = new.receiver_id;
  v_link := case v_receiver.role
    when 'student' then '/student/chat'
    when 'facilitator' then '/facilitator/chat?with=' || new.sender_id::text
    else '/'
  end;
  perform public.notify(new.receiver_id, 'chat', 'New message from ' || v_sender.first_name, left(new.message, 140), v_link, 'chat:' || new.sender_id::text);
  return new;
end;
$$;

create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public.trg_chat_notify();

-- ---------------------------------------------------------------------------
-- Assignments: student gets their facilitator; facilitator gets the student (unless they did it
-- themselves by adding the student to a batch); Campus Heads are warned about different-gender pairs
-- ---------------------------------------------------------------------------
create or replace function public.trg_assignment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facilitator public.profiles%rowtype;
  v_student public.profiles%rowtype;
  v_actor uuid := auth.uid();
begin
  if not new.is_active then
    return new;
  end if;

  select * into v_facilitator from public.profiles where id = new.facilitator_id;
  select * into v_student from public.profiles where id = new.student_id;

  perform public.notify(new.student_id, 'assignment', v_facilitator.first_name || ' is now your facilitator',
    'You can message them and see when they''re available.', '/student');

  if v_actor is distinct from new.facilitator_id then
    perform public.notify(new.facilitator_id, 'assignment', v_student.first_name || ' ' || v_student.last_name || ' was assigned to you',
      'They''re now one of your students.', '/facilitator/students');
  end if;

  if v_facilitator.gender is distinct from v_student.gender then
    perform public.notify_campus_heads(new.campus_id, v_actor, 'assignment', 'Different-gender assignment',
      v_student.first_name || ' ' || v_student.last_name || ' is assigned to ' || v_facilitator.first_name
        || ', so chat is off for them. Consider reassigning.', '/campus-head/students');
  end if;
  return new;
end;
$$;

create trigger facilitator_students_notify after insert on public.facilitator_students
  for each row execute function public.trg_assignment_notify();

-- ---------------------------------------------------------------------------
-- Batches: Campus Heads see when a facilitator starts and finishes
-- ---------------------------------------------------------------------------
create or replace function public.trg_batch_started_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facilitator public.profiles%rowtype;
begin
  select * into v_facilitator from public.profiles where id = new.facilitator_id;
  perform public.notify_campus_heads(new.campus_id, new.facilitator_id, 'batch',
    v_facilitator.first_name || ' started Batch ' || new.batch_number, 'See who they''re with on Live.', '/campus-head/live');
  return new;
end;
$$;

create trigger engagement_batches_started_notify after insert on public.engagement_batches
  for each row execute function public.trg_batch_started_notify();

create or replace function public.trg_batch_finished_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facilitator public.profiles%rowtype;
  v_total int;
  v_engaged int;
begin
  select * into v_facilitator from public.profiles where id = new.facilitator_id;
  select count(*), count(*) filter (where e.is_engaged) into v_total, v_engaged
  from public.batch_students bs
  left join public.engagement_logs e on e.attendance_log_id = bs.attendance_log_id
  where bs.batch_id = new.id;

  perform public.notify_campus_heads(new.campus_id, new.facilitator_id, 'batch',
    v_facilitator.first_name || ' finished Batch ' || new.batch_number,
    v_total || ' ' || case when v_total = 1 then 'student' else 'students' end || ' · ' || v_engaged || ' engaged',
    '/campus-head/history');
  return new;
end;
$$;

create trigger engagement_batches_finished_notify after update on public.engagement_batches
  for each row when (old.status = 'open' and new.status = 'finished')
  execute function public.trg_batch_finished_notify();

-- A student is told when they are checked in (added to a batch)
create or replace function public.trg_checked_in_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facilitator public.profiles%rowtype;
begin
  select p.* into v_facilitator
  from public.engagement_batches b join public.profiles p on p.id = b.facilitator_id
  where b.id = new.batch_id;
  perform public.notify(new.student_id, 'attendance', 'You''re checked in',
    v_facilitator.first_name || ' marked you present today.', '/student/attendance');
  return new;
end;
$$;

create trigger batch_students_notify after insert on public.batch_students
  for each row execute function public.trg_checked_in_notify();

-- ---------------------------------------------------------------------------
-- Engagement milestones worth a Campus Head's attention
-- ---------------------------------------------------------------------------
create or replace function public.trg_engagement_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.profiles%rowtype;
  v_recorder public.profiles%rowtype;
  v_name text;
begin
  select * into v_student from public.profiles where id = new.student_id;
  select * into v_recorder from public.profiles where id = new.facilitator_id;
  v_name := v_student.first_name || ' ' || v_student.last_name;

  if new.accepted_jesus and (tg_op = 'INSERT' or not old.accepted_jesus) then
    perform public.notify_campus_heads(new.campus_id, new.facilitator_id, 'engagement',
      v_name || ' accepted Jesus', 'Recorded by ' || v_recorder.first_name || '.', '/campus-head/history');
  end if;
  if new.wants_dgroup and (tg_op = 'INSERT' or not old.wants_dgroup) then
    perform public.notify_campus_heads(new.campus_id, new.facilitator_id, 'engagement',
      v_name || ' wants to join a D-Group', 'Recorded by ' || v_recorder.first_name || '.', '/campus-head/history');
  end if;
  return new;
end;
$$;

create trigger engagement_logs_notify after insert or update on public.engagement_logs
  for each row execute function public.trg_engagement_notify();

-- ---------------------------------------------------------------------------
-- Invitations: tell the Campus Head (or Super Admin) when someone finishes setting up
-- ---------------------------------------------------------------------------
create or replace function public.trg_invitation_accepted_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := new.first_name || ' ' || new.last_name;
  v_admin uuid;
begin
  if new.role = 'student' then
    perform public.notify_campus_heads(new.campus_id, null, 'invitation', v_name || ' accepted the invitation',
      'They''ve set their password and can use their QR card.', '/campus-head/students');
  elsif new.role = 'facilitator' then
    perform public.notify_campus_heads(new.campus_id, null, 'invitation', v_name || ' joined as a facilitator',
      'They''ve accepted the invitation.', '/campus-head/facilitators');
  elsif new.role = 'campus_head' then
    for v_admin in select id from public.profiles where role = 'super_admin' and is_active loop
      perform public.notify(v_admin, 'invitation', v_name || ' accepted the Campus Head invitation', null, '/admin/users');
    end loop;
  end if;
  return new;
end;
$$;

create trigger profiles_invitation_accepted_notify after update of invitation_accepted_at on public.profiles
  for each row when (old.invitation_accepted_at is null and new.invitation_accepted_at is not null)
  execute function public.trg_invitation_accepted_notify();

-- ---------------------------------------------------------------------------
-- System problems go to every Super Admin (opens the system logs)
-- ---------------------------------------------------------------------------
create or replace function public.trg_system_error_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  for v_admin in select id from public.profiles where role = 'super_admin' and is_active loop
    perform public.notify(v_admin, 'system', 'System problem: ' || replace(new.event, '_', ' '),
      left(coalesce(new.detail ->> 'error', new.detail::text, ''), 160), '/admin/logs');
  end loop;
  return new;
end;
$$;

create trigger system_logs_error_notify after insert on public.system_logs
  for each row when (new.level = 'error')
  execute function public.trg_system_error_notify();
