-- Elevate Campus Hub — 0007 data privacy consent records
--
-- Two separate facts are recorded (Data Privacy Act of 2012, RA 10173: consent should be provable):
--   1. data_consent_*      — the person was informed and agreed when their account was REGISTERED.
--                            Captured by the facilitator / Campus Head / Super Admin who entered their details
--                            (data_consent_by). Required before an account can be created.
--   2. privacy_accepted_*  — the person accepted the notice THEMSELVES when they set up (or later re-confirmed)
--                            their account. Required again whenever the notice version changes.
--
-- No backfill: existing accounts have not accepted anything yet, so they will be asked once at their next sign-in.

alter table public.profiles
  add column data_consent_at timestamptz,
  add column data_consent_version text,
  add column data_consent_by uuid references public.profiles (id) on delete set null,
  add column privacy_accepted_at timestamptz,
  add column privacy_accepted_version text;

comment on column public.profiles.data_consent_at is 'When consent to collect/use this person''s data was recorded at registration.';
comment on column public.profiles.data_consent_by is 'Who recorded that consent on the person''s behalf (null when they did it themselves).';
comment on column public.profiles.privacy_accepted_version is 'Version of the Data Privacy Notice the person last accepted themselves (see src/lib/privacy.ts).';
