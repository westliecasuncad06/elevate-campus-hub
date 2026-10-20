-- Elevate Campus Hub — 0011 programs belong to a campus; students can have a typed course
--
-- The four programs (BSIT, BSED, BSA, BSBA) were "global" (campus_id null) and so were offered to every campus.
-- They are GRC's courses, so they now belong to GRC. A campus that has no programs of its own lets students TYPE
-- their course instead of picking from a list, which is what `profiles.course` holds.

update public.programs
set campus_id = (select id from public.campuses where code = 'GRC')
where campus_id is null
  and exists (select 1 from public.campuses where code = 'GRC');

-- Free-text course, used when the student's campus has no program list. (A student has either program_id or course.)
alter table public.profiles
  add column course text
  check (course is null or char_length(btrim(course)) between 1 and 80);
