-- Elevate Campus Hub — 0014 invite a Campus Head or facilitator with just their email
--
-- Until now whoever added a Campus Head or facilitator had to type their name, gender, phone and more. Now only the
-- email is needed: the person gets an invitation with a 6-digit code, registers, and fills in their own details.
--
-- Until they do, we only know their email, so the profile is marked `details_complete = false`. A facilitator's
-- gender is normally required (it decides who they can chat with); the rule now waits until they have registered.

alter table public.profiles
  add column details_complete boolean not null default true;

alter table public.profiles drop constraint profiles_gender_required;

alter table public.profiles
  add constraint profiles_gender_required
  check (role not in ('student', 'facilitator') or gender is not null or not details_complete);
