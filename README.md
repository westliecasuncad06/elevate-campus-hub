# Elevate Campus Hub

Attendance, engagement tracking, daily reporting and same-gender chat for campus ministry teams.
Built with Next.js (App Router), Supabase and Vercel — all on free tiers. First campus: GRC.

The full specification is in [PROJECT_SPECIFICATION.md](PROJECT_SPECIFICATION.md).

## Roles

| Role | What they do |
|---|---|
| Super Admin (IT) | Campuses, programs, all users, direct password resets, system logs |
| Campus Head | Creates facilitators/students, scans attendance, reviews/locks the daily report, sends it to Google |
| Facilitator | Scans attendance, registers first timers, records engagement, chats with same-gender students |
| Student | Own QR card, assigned facilitator, attendance history, chat |

Students are assigned automatically to the first facilitator who adds them to a batch.

### How a facilitator's day works (batches)

1. **Today → Start engage** opens **Batch 1**. (There is no separate Attendance page any more.)
2. Inside the batch, **Add students** records attendance: scan a QR, look up by phone/email, or register a first timer.
3. Tap each student to record the four engagement questions. That also stamps how long the engagement took.
4. **Add another batch** can be used at any time (you get a reminder if the current batch still has unrecorded students).
5. **Finish batch** is only allowed once every student has their engagement recorded. It then moves to **History**.

The Campus Head runs batches the same way, and also gets **History** (every finished batch, filter by facilitator/date)
and **Live** (who is facilitating right now and who they're with; refreshes every 10 seconds).

> **Already ran `setup.sql` before batches existed?** Run `npm run db:migrate` (see below), or paste
> `supabase/migrations/0005_batches.sql` into the Supabase SQL Editor once. Either way your data is kept (earlier
> attendance becomes finished batches in History). A brand-new project only needs `supabase/setup.sql`,
> which already includes it.

### Notifications

The bell in the header (and **All notifications**) lists what happened, and **clicking one opens what it's about**. They are
created by the database itself, so they appear no matter which screen caused the event, and new ones show up live.

| Who | Gets notified when | Opens |
|---|---|---|
| Student | a facilitator is assigned · they're checked in · a new chat message | their card · Attendance · Chat |
| Facilitator | a student is assigned to them · a new chat message | My students · that student's chat |
| Campus Head | a facilitator starts/finishes a batch · a student accepts Jesus or wants a D-Group · an invitation is accepted · a different-gender assignment | Live · History · Students/Facilitators · Students |
| Super Admin | a system problem (for example a report that failed to send) · a Campus Head accepts their invitation | System logs · Users |

Several chat messages from one person fold into one notification with a counter. Notifications older than 60 days are deleted
by the keep-alive job.

### Data privacy (Data Privacy Act of 2012, RA 10173)

- **At registration** (First timer, and Add student / facilitator / Campus Head) a short privacy summary is shown with a required
  consent checkbox. The person registering confirms the person (or their parent/guardian if under 18) was told and agrees.
  Nothing is stored without it; who confirmed it, when, and which notice version is saved on the profile
  (`data_consent_*`).
- **At account setup** (choosing a password) the person accepts the notice themselves (`privacy_accepted_*`).
- **Existing accounts** and everyone after a notice change are asked once at their next sign-in (`/accept-privacy`).
  Bump `PRIVACY_VERSION` in `src/lib/privacy.ts` whenever the notice changes in a way that needs re-acceptance.
- The full notice is public at `/privacy` and is generated from the same data lists as the registration summary
  (`src/lib/privacy.ts`), so they can't disagree. Set `NEXT_PUBLIC_PRIVACY_CONTACT` to the contact people should use.

> The notice text is a plain-language **template**. Have your organisation's Data Protection Officer or legal counsel review it
> (retention period, contact, cross-border transfer wording) before real students are registered.

### Look and feel

Colours come from the Elevate logo: black, white and the logo red `#ED482D` (buttons use a slightly deeper red so white text stays
readable). The mark is the inverted V from the logo (`src/components/brand.tsx`). Display type (wordmark, tagline) is
Archivo in its wide, heavy, slanted style. After changing the email templates in `docs/email-templates/`, paste them into
Supabase again (**Authentication → Email Templates**).

### Applying database changes with `npm run db:migrate`

Instead of pasting SQL by hand, put your database connection string in `.env.local`:

1. Supabase dashboard → **Connect** (top bar) → **Session pooler** → copy the **URI**.
2. Replace `[YOUR-PASSWORD]` with the database password you chose when creating the project
   (forgot it? **Project Settings → Database → Reset database password**).
3. Paste it after `SUPABASE_DB_URL=` in `.env.local`. It gives full database access: never share or commit it.
4. `npm run db:migrate -- --dry` lists what's pending; `npm run db:migrate` applies it. Each file runs once, inside a
   transaction (if it fails, nothing changes), and is recorded in `public.schema_migrations`.

## First-time setup

### 1. Create the Supabase project (free)

1. Go to <https://supabase.com> → **Start your project** → sign in (GitHub is easiest).
2. **New project** → name it `elevate-campus-hub`, choose a strong database password (save it somewhere),
   region **Southeast Asia (Singapore)** → **Create new project**. Wait ~2 minutes.
3. **Project Settings → API**. Copy three values:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (secret — never share it or commit it)
4. Copy `.env.local.example` to `.env.local` and paste those three values in. Fill in `SEED_SUPER_ADMIN_*`
   with the email and password you want for the first IT account. Set `CRON_SECRET` to any long random text.

### 2. Create the database tables

1. In Supabase open **SQL Editor → New query**.
2. Open [supabase/setup.sql](supabase/setup.sql), copy everything, paste it into the editor, press **Run**.
   You should see "Success. No rows returned". (It runs as one transaction: if anything fails, nothing is half-applied.)
   Run it once only.

### 3. Configure sign-in

In Supabase **Authentication**:

1. **URL Configuration** → Site URL `http://localhost:3000`; add `http://localhost:3000/**` to Redirect URLs.
   (When you deploy, add your Vercel URL here too.)
2. **Sign In / Providers → Email** → turn **off** "Allow new users to sign up" (only invited people should get in).
3. **Email Templates** → paste in the two branded templates from [docs/email-templates/](docs/email-templates/):
   - **Invite user** → subject `You're invited to Elevate Campus Hub`, body = [invite.html](docs/email-templates/invite.html)
   - **Reset password** → subject `Choose your Elevate Campus Hub password`, body = [recovery.html](docs/email-templates/recovery.html)
     (used when someone opened their invitation but never chose a password, and Campus Head presses *Resend invitation*)

   Paste everything from `<!doctype html>` down. Both buttons go to this app's `/auth/confirm` page, which signs the
   person in and shows "Choose your password". The app also copes with Supabase's default template (the link's
   sign-in token is read in the browser by `/auth/finish`), so a missed template never blocks someone from signing up.
   The Site URL from step 1 must be correct, because the buttons are built from it.

4. **Sign In / Providers → Email → Email OTP Expiration** → set it to the maximum (`86400` seconds = 24 hours).
   Invitation links expire after 1 hour by default, which is too short for students who check email later.
   If a link does expire, the Campus Head can press **Resend invitation** on the Students page.
5. **Email delivery:** Supabase's built-in sender only allows a handful of emails per hour. Before registering
   real students, add a free SMTP provider under **Authentication → SMTP Settings** (for example Brevo or Resend).

### 4. Run the app

```bash
npm install
npm run seed:admin     # creates the first Super Admin from .env.local
npm run dev            # http://localhost:3000
```

Sign in as the Super Admin, then: **Users → Add campus head** for GRC.

### 5. Google reports (optional until you need them)

1. Open <https://script.google.com> → New project → paste [docs/google-apps-script/Code.gs](docs/google-apps-script/Code.gs).
2. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**. Copy the Web app URL.
3. Put it in `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` (and later in Vercel).
4. Make sure the Google account that deployed the script can edit the target Google Doc.

The Google Form step is a placeholder until the target form's fields are known.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app locally |
| `npm run build` | Production build |
| `npm test` | Unit tests |
| `npm run db:selftest` | Runs `supabase/setup.sql` on a throwaway in-memory Postgres and checks the permission rules (no Supabase needed) |
| `npm run verify:rls` | Checks the database rules against your real Supabase project with throwaway test users |
| `npm run seed:admin` | Creates the first Super Admin |
| `npm run seed:demo` | Creates demo accounts for every role (see `TEST_ACCOUNTS.md`). Demo data only: remove before going live |
| `npm run db:bundle` | Rebuilds `supabase/setup.sql` from `supabase/migrations/*` |

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. <https://vercel.com> → **Add New → Project** → import the repository.
3. Add the environment variables from `.env.local` (set `NEXT_PUBLIC_SITE_URL` to your Vercel URL).
4. Deploy, then add the Vercel URL to Supabase **Authentication → URL Configuration**.
5. `vercel.json` schedules `/api/cron/keep-alive` every 3 days so Supabase never pauses the free project.
   Verify: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/keep-alive`.

## Project notes

- **Timezone:** attendance days follow each campus's timezone (default `Asia/Manila`), not UTC.
- **Attendance rule:** one record per student per day, created when the student is added to a batch (time in).
  A student is in at most one batch per day. Time out is no longer "left the hub": it is when the facilitator
  recorded that student's engagement, so History shows how long each engagement took.
- **Extra table:** `system_logs` records keep-alive pings, password resets and report submissions.
- **Security:** every table has Row Level Security. The service-role key is used only in server code for
  account creation, password resets, the cron job and webhook logging.
