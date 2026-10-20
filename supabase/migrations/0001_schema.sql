-- Elevate Campus Hub — 0001 schema
-- Tables, constraints, indexes and triggers. RLS policies live in 0002.

-- ---------------------------------------------------------------------------
-- campuses
-- ---------------------------------------------------------------------------
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  -- Attendance dates are computed in the campus timezone (the DB runs in UTC).
  timezone text not null default 'Asia/Manila',
  target_google_doc_id text,
  google_form_webhook_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- programs (campus_id null = global, available to every campus)
-- ---------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses (id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index programs_code_unique
  on public.programs (coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code));

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  campus_id uuid references public.campuses (id),
  role text not null check (role in ('super_admin', 'campus_head', 'facilitator', 'student')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  gender text check (gender in ('male', 'female')),
  birthday date,
  church text,
  religion text,
  program_id uuid references public.programs (id),
  year_level int check (year_level between 1 and 10),
  student_number text,
  qr_token text unique,
  is_active boolean not null default true,
  password_changed boolean not null default false,
  invitation_sent_at timestamptz,
  invitation_accepted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Only the Super Admin is global; everyone else belongs to a campus.
  constraint profiles_campus_required check (role = 'super_admin' or campus_id is not null),
  -- Gender drives same-gender chat, so it is mandatory for chat participants.
  constraint profiles_gender_required check (role not in ('student', 'facilitator') or gender is not null)
);

create unique index profiles_email_unique on public.profiles (lower(email));
create unique index profiles_phone_per_campus on public.profiles (campus_id, phone) where phone is not null;
create index profiles_campus_role_idx on public.profiles (campus_id, role);

-- Every student gets a unique QR token automatically.
create or replace function public.profiles_set_qr_token()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'student' and new.qr_token is null then
    new.qr_token := gen_random_uuid()::text;
  end if;
  return new;
end;
$$;

create trigger profiles_set_qr_token
  before insert on public.profiles
  for each row execute function public.profiles_set_qr_token();

-- ---------------------------------------------------------------------------
-- facilitator_students (a student has at most one ACTIVE facilitator)
-- ---------------------------------------------------------------------------
create table public.facilitator_students (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  campus_id uuid not null references public.campuses (id),
  assigned_date date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index facilitator_students_one_active_per_student
  on public.facilitator_students (student_id) where is_active;
create index facilitator_students_facilitator_idx on public.facilitator_students (facilitator_id) where is_active;

-- ---------------------------------------------------------------------------
-- facilitator_availability
-- ---------------------------------------------------------------------------
create table public.facilitator_availability (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint availability_time_order check (end_time > start_time)
);

create index facilitator_availability_facilitator_idx
  on public.facilitator_availability (facilitator_id, day_of_week);

-- ---------------------------------------------------------------------------
-- attendance_logs (one row per student per campus-local day)
-- ---------------------------------------------------------------------------
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id),
  student_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  time_in timestamptz not null default now(),
  time_out timestamptz,
  purpose text,
  scanned_by uuid not null references public.profiles (id),
  entry_method text not null check (entry_method in ('qr', 'phone', 'email', 'manual')),
  created_at timestamptz not null default now(),
  constraint attendance_one_per_day unique (student_id, log_date)
);

create index attendance_logs_campus_date_idx on public.attendance_logs (campus_id, log_date);

-- ---------------------------------------------------------------------------
-- engagement_logs (0..1 per attendance log)
-- ---------------------------------------------------------------------------
create table public.engagement_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null unique references public.attendance_logs (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  facilitator_id uuid not null references public.profiles (id),
  campus_id uuid not null references public.campuses (id),
  is_engaged boolean not null default false,
  heard_gospel boolean not null default false,
  accepted_jesus boolean not null default false,
  wants_dgroup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index engagement_logs_campus_idx on public.engagement_logs (campus_id);

-- ---------------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------------
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id),
  report_date date not null,
  total_attendance int not null default 0,
  students_engaged int not null default 0,
  students_heard_gospel int not null default 0,
  students_accepted_jesus int not null default 0,
  students_wants_dgroup int not null default 0,
  volunteers_count int not null default 0,
  notes text,
  submitted_by uuid not null references public.profiles (id),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_reports_one_per_day unique (campus_id, report_date)
);

-- ---------------------------------------------------------------------------
-- report_submissions (history of pushes to Google Docs / Forms)
-- ---------------------------------------------------------------------------
create table public.report_submissions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id),
  report_title text not null,
  date_from date not null,
  date_to date not null,
  total_attendees int not null default 0,
  target_google_doc_url text,
  target_google_form_url text,
  submission_type text not null check (submission_type in ('google_docs', 'google_form')),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'failed')),
  payload jsonb,
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now()
);

create index report_submissions_campus_idx on public.report_submissions (campus_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  campus_id uuid not null references public.campuses (id),
  message text not null check (char_length(message) between 1 and 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index chat_messages_pair_idx on public.chat_messages (sender_id, receiver_id, created_at);
create index chat_messages_receiver_unread_idx on public.chat_messages (receiver_id) where not is_read;

-- ---------------------------------------------------------------------------
-- system_logs (11th table: Super Admin log viewer + keep-alive status)
-- ---------------------------------------------------------------------------
create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index system_logs_created_idx on public.system_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance + locked-report guard
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger engagement_logs_updated_at
  before update on public.engagement_logs
  for each row execute function public.set_updated_at();

create trigger daily_reports_updated_at
  before update on public.daily_reports
  for each row execute function public.set_updated_at();

-- A locked report cannot be edited. Unlocking (locked -> unlocked) is allowed.
create or replace function public.daily_reports_guard_locked()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked and new.is_locked then
    raise exception 'This daily report is locked. Unlock it before editing.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger daily_reports_guard_locked
  before update on public.daily_reports
  for each row execute function public.daily_reports_guard_locked();
