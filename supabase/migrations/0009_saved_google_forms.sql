-- Elevate Campus Hub — 0009 saved Google Forms
--
-- A campus can save several Google Forms (for example the weekly engagement report and a separate event report)
-- and the Campus Head picks which one to send a day's report to. This replaces the single campuses.google_form_url
-- from 0008: any link already stored there is moved into the new table first.

create table public.campus_google_forms (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Always the normalised ".../forms/d/e/<id>/viewform" address (the app builds it), never a free-form URL.
  url text not null check (url like 'https://docs.google.com/forms/d/e/%'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campus_google_forms_unique_url unique (campus_id, url)
);

create index campus_google_forms_campus_idx on public.campus_google_forms (campus_id);

-- Only the campus's own Campus Head (and the Super Admin, read-only) can see or change a campus's forms.
alter table public.campus_google_forms enable row level security;

create policy campus_google_forms_select on public.campus_google_forms for select to authenticated
  using (
    public.auth_role() = 'super_admin'
    or (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  );

create policy campus_google_forms_campus_head_write on public.campus_google_forms for all to authenticated
  using (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id())
  with check (public.auth_role() = 'campus_head' and campus_id = public.auth_campus_id());

-- Keep whatever link a campus already had (0008 stored one per campus).
insert into public.campus_google_forms (campus_id, name, url)
select id, 'Google Form', google_form_url
from public.campuses
where google_form_url like 'https://docs.google.com/forms/d/e/%'
on conflict do nothing;

alter table public.campuses drop column google_form_url;
