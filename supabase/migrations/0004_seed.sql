-- Elevate Campus Hub — 0004 seed data
-- GRC campus + default (global) programs. Safe to re-run.

insert into public.campuses (code, name, timezone)
values ('GRC', 'Global Reciprocal Colleges', 'Asia/Manila')
on conflict (code) do nothing;

insert into public.programs (campus_id, code, name, sort_order)
values
  (null, 'BSIT',  'BS Information Technology',      1),
  (null, 'BSED',  'BS Education',                   2),
  (null, 'BSA',   'BS Accountancy',                 3),
  (null, 'BSBA',  'BS Business Administration',     4)
on conflict do nothing;
