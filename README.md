# Elevate Campus Hub

Attendance, engagement tracking, daily reporting and same-gender chat for campus ministry teams.
Built with Next.js (App Router), Supabase and Vercel — all on free tiers. First campus: GRC.

The full specification is in [PROJECT_SPECIFICATION.md](PROJECT_SPECIFICATION.md).

## Roles

| Role | What they do |
|---|---|
| Super Admin (IT) | Campuses, each campus's programs, all users (add, **edit, move between campuses, change role, delete**), direct password resets, system logs |
| Campus Head | Creates facilitators/students, scans attendance, watches each student's consistency (**Attendance sheet**), reviews/locks the daily report, sends it to the Google Form |
| Facilitator | Scans attendance, registers first timers, records engagement, chats with same-gender students |
| Student | Own QR card, their facilitator's **name** and availability (not their email or phone), attendance history, chat |

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

### Adding a Campus Head or facilitator: email only

**Add facilitator** (Campus Head or Super Admin) and **Add campus head** (Super Admin) ask for **just the email** (and the campus,
for the Super Admin). The person is sent an invitation with a **registration code**, and then registers themselves:

1. They open the **Register** button in the email (or go to `/register`), type the code (their email is already filled in),
2. then **Complete your registration**: their own name, gender, phone, birthday and a password, and they accept the Data
   Privacy Notice themselves.

A facilitator's gender is required (it decides who they can chat with); a Campus Head's is optional. Until they register the
person shows as **Pending invitation**, is called by their email, can't sign in, and can't be given students. **Resend invitation**
sends a fresh code. The email also has a one-time link as a backup, which leads to the same registration page. Facilitators and
Campus Heads still register students with their details. **Only the Super Admin** can also invite a **student by email only**
(**Users → Invite student by email**): the student registers with the code and fills in their own name, gender, phone, birthday,
program or course, year level and the rest, then accepts the privacy notice. Their name is matched to the campus roster at that
moment. Until they register they show as **Pending invitation** and can't be checked in.

Two things to set in Supabase (the code comes from Supabase's email OTP, so they live there):
- Paste the new invitation email, [docs/email-templates/invite.html](docs/email-templates/invite.html), into **Authentication →
  Email Templates → Invite user** (it shows the code and the Register button).
- **Authentication → Providers → Email → Email OTP Length: 6** (a new project defaults to 8; the app accepts 6 to 10 digits), and
  pick how long a code stays valid (**Email OTP Expiration**), for example a day.

### Student roster (names loaded before accounts exist)

A campus can already have its students' names on an attendance sheet. IT loads that list into the **roster**, and the Campus
Head sees it under **Roster** (everyone, who has registered and who hasn't, with a search and a **Remove** button for a name
listed twice or someone who left). When a student is registered, by a facilitator, a Campus Head or as a first-timer, with a
name that matches a roster name, the two are **linked automatically** and the success message says so. Matching ignores the
order of the words ("Abordo, Irish Nicole" = "Irish Nicole Abordo"), capital letters, accents, middle initials and "Jr."; it only
links an **exact** match of the remaining words, so two different people are never mixed up. Deleting the account frees the name.
The roster carries each name's gender, the year/course written on the sheet and **the attendance marked on the sheet** (green =
present, red = absent, read from the cell colours). Until a name has an account, the Campus Head sees that attendance on the
**Attendance sheet** (the name shows a "No account yet" tag and can be filtered). When the student registers and the name
matches, the days marked present are copied into their own attendance records (shown as 9:00 AM check-ins), so their attendance
page, consistency figures and the campus's counts carry on from that history. Days marked absent stay on the sheet as absences.

Load or refresh a roster (IT, from the project folder; needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`):

```bash
npm run roster:import -- --campus GRC --url "https://docs.google.com/spreadsheets/d/<id>/edit?gid=<tab>" --dry-run
npm run roster:import -- --campus GRC --url "https://docs.google.com/spreadsheets/d/<id>/edit?gid=<tab>"
```

The sheet must be shared as "Anyone with the link can view" (the script downloads its web-page export, which keeps the cell
colours; add `--names-only` to skip the attendance, or use `--file roster.csv --html sheet.html` for saved copies). The first
column is **Name**; **Gender** and **Year Level / Course** are used when present, and every date column (like `9/18/26`) is read by
colour. Run it again whenever the sheet grows: names already on the roster are not overwritten, a day's mark is updated to the
sheet's colour, and existing accounts with a matching name are linked and get their green days.

Students can change their own **year level** from **My card**; every other detail is changed by their facilitator or Campus Head.
Names typed in capitals by accident ("JARDIN") are saved as "Jardin" everywhere a name is entered.

### Security and two-step verification

See [SECURITY.md](SECURITY.md) for everything in one place. In short: **4 wrong passwords make the next try wait 60 seconds** (longer limits catch slow guessing, and a
correct password never counts against anyone), bots are caught by a hidden field and an optional free Cloudflare Turnstile check, new passwords need
10+ characters and can't be common, every page carries a strict Content-Security-Policy, and every database query is parameterised (no SQL injection).

Everyone can turn on **two-step verification** under **Account & security** (side menu, or **More** on a phone): after the password, a 6-digit code from an
authenticator app. The database itself refuses a password-only session of someone who turned it on, so it can't be bypassed. **Continue with Google stays the easy
login** and is not asked for the code. Lost phone: the Super Admin (anyone) or the Campus Head (their people) presses **Reset 2-step** next to the name.

### Signing in with Google

The sign-in page also has **Continue with Google**, so people don't have to remember a password. It appears by itself once the
Google provider is switched on in Supabase ([setup steps](DEPLOYMENT.md#sign-in-with-google-optional)). It does **not** open the
app to everyone: the Google account's email must belong to someone who was already invited, otherwise the person is turned away
with "That Google account hasn't been invited yet" and nothing is created. The first time, someone who hasn't registered yet
still fills in their details and accepts the Data Privacy Notice, but a password is optional. Email and password keep working.

### Managing users (Super Admin)

**Users** lists everyone with a login. Each row has **Edit**, **Reset password**, **Deactivate** and **Delete**.

- **Edit** changes any of the person's details (name, email, phone, gender, birthday, and for students the course, year, church,
  religion and student number). Changing the **email** changes their login email too.
- **Campus and role.** Any Campus Head, facilitator or student can be moved to another campus. A Campus Head or facilitator can
  also become the other role, at any campus. Students stay students, and Super Admins have no campus.
- **Facilitators can work at several campuses.** In **Edit**, a facilitator has the campus they work at now plus an **Also works
  at** list: tick every other school they go to. Campus Heads and students belong to exactly one campus, and each campus keeps
  its own Campus Head. Unticking a campus ends the facilitator's student assignments there (and only there).
  - Their current student assignments end, because they only make sense inside one campus and one role. Those students are
    matched with a facilitator again at their next meeting. Past attendance stays with the campus where it happened.
  - They must have no open batch (and a student must not be in one): finish it first. If a move is refused, nothing changes.
  - The change applies right away, even if the person is signed in.
- **Delete** is permanent. A student's attendance, engagement answers, chat and notifications go with them. A Campus Head or
  facilitator who has recorded attendance, run a batch or sent a report **can't be deleted**, because those records carry their
  name: **Deactivate** them instead, which keeps the history. You can't delete yourself or another Super Admin.
- Every change is written to the system logs (which fields changed, never the values).

#### A facilitator at several campuses

- A **campus switcher** appears in the top bar (only for facilitators with more than one campus). Everything on screen (Today,
  batches, students, attendance) is for the campus selected there. Switching needs **no open batch**: a batch belongs to the
  campus it was started at, so finish it first.
- **My students** and **Chat** include the students assigned to the facilitator at every campus they work at, so a message from
  a student at another school isn't lost while they're at a different one.
- Each campus's **Campus Head** sees the facilitators who work there (**Facilitators** page, availability, assigning students),
  even while those are set to another campus. Such a facilitator is marked "Also works at another campus", and can only be
  deactivated by the Super Admin, because that would switch them off at every school.
- Under the hood, `profiles.campus_id` is "the campus I'm working at right now", and `profile_campuses` lists the others, so every
  existing batch, attendance and permission rule works unchanged for whichever campus is selected.

### Programs and courses

Programs belong to **one campus**. GRC's are BSIT, BSED, BSA and BSBA, managed under **Programs**.

- A campus **with** programs gives students a **Program** dropdown when they register.
- A campus **without** any lets students **type their course** (for example "BS Nursing"). Add a program to that campus later
  and its registration forms switch to the dropdown.
- The course is shown (program code or typed course) on the Students list, the attendance sheet and the student's card.

### Attendance sheet (Campus Head)

**Attendance sheet** is the Campus Head's view of how consistently each student comes, laid out like the ministry's Google
Sheet: one row per student (name, gender, year / course) and one column for every day the campus met. A ✓ means attended,
a ✕ means not, and a dash means the day didn't count for that student.

- A **session** is a day when at least one student was recorded. Pick any range (default: the last 90 days, up to a year).
- A student is only counted against sessions held **after they registered**, and today's open session never counts as missed.
- **Status** from the share of countable sessions attended: Consistent 80%+, Regular 50–79%, Occasional 20–49%, Rarely under 20%,
  New with fewer than 2 sessions. **At risk** = came before but missed the last 3 or more in a row.
- Filter by course, year, facilitator or status, search by name, sort (for example least consistent first), and **Export CSV**.

### Daily report → Google Form

The ministry's "Elevate Engagement Report" Google Form asks for the Date, School/Location, and the number engaged, who heard
the Gospel, accepted Jesus, are willing to join a Dgroup, and volunteers. **Daily report** fills all seven from the saved day
(*Engaged/Attendees* is the day's total attendance), shows them in a preview, and **Send to Google Form** submits them.

- **School/Location** is editable per report and defaults to the campus's setting (GRC: "Global Reciprocal Colleges", set by
  the Super Admin under **Campuses → Edit**).
- **Saved forms:** the Campus Head keeps a list of Google Forms (**Manage forms** → paste the form's link, optionally a name;
  the form's own title is used if you leave it empty). Each link is **checked before it is saved**: it must be reachable,
  accept responses without a Google sign-in, and ask only questions the system can answer. Pick which form to send to from
  the **Send to** list (the one you last sent to successfully is pre-selected).
- The app reads the form's questions when it sends, so it keeps working if Google renumbers the question IDs. If the
  questions are changed so much that they can't be matched, it refuses and tells you instead of sending partial data.
- A day that was already sent **to that form** needs a ticked **Send again**, so the sheet doesn't get an accidental duplicate
  row. Sending the same day to a different saved form is fine.
- Every attempt (sent or failed) is listed under **Sent reports**, with the form's name, and in the system logs.
- **Copy report** copies the numbers on screen as plain text to paste into a chat:

  ```
  Campus Hub
  October 20, 2026

  Total Attendance: 37
  No. of Students Engaged: 18
  No. of Students who hear the Gospel: 12
  No. of Students who accepted Jesus: 12
  No. of Students who wants to join a D-Group: 0
  No. of Volunteers: 6
  ```
  The wording lives in `src/lib/report-text.ts` if it ever needs to change.

> **Already ran `setup.sql` before this?** Run `npm run db:migrate` to apply `0008_form_report_and_attendance_sheet.sql` and
> `0009_saved_google_forms.sql` (which moves any form link a campus already had into the saved-forms list). Later migrations
> (`0010`–`0013`: facilitator privacy, programs per campus with typed courses, moving people between campuses, and facilitators
> working at several campuses) are applied the same way.

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

   Paste everything from `<!doctype html>` down. The invitation shows a **registration code** and a **Register** button (the
   person types the code at `/register`); the password email's button goes to `/auth/confirm`, which signs the person in. The
   emails have **no images** and link straight to `https://elevate-campus-hub.vercel.app` (written into the templates; change
   it there if the app moves). The app also copes with Supabase's default template (the link's sign-in token is read in the
   browser by `/auth/finish`), so a missed template never blocks someone from signing up. Still set the **Site URL** in step 1
   correctly (once deployed: the address people type, never the `vercel.com/...` dashboard link).

4. **Sign In / Providers → Email → Email OTP Expiration** → set it to the maximum (`86400` seconds = 24 hours).
   Invitation links expire after 1 hour by default, which is too short for students who check email later.
   If a link does expire, the Campus Head can press **Resend invitation** on the Students page.
5. **Email delivery:** Supabase's built-in sender only allows a handful of emails per hour. Before registering
   real students, add a free SMTP provider under **Authentication → SMTP Settings** (for example Brevo or Resend).
6. **Google sign-in (optional):** create a Google OAuth client and switch the Google provider on in Supabase. The full
   click-by-click is in [DEPLOYMENT.md](DEPLOYMENT.md#sign-in-with-google-optional). Keep "Allow new users to sign up" **off**.

### 4. Run the app

```bash
npm install
npm run seed:admin     # creates the first Super Admin from .env.local
npm run dev            # http://localhost:3000
```

Sign in as the Super Admin, then: **Users → Add campus head** for GRC.

### 5. Google reports (optional until you need them)

**Google Form:** nothing to deploy. The form must accept responses without a Google sign-in (don't tick "Limit to 1 response"
or "Restrict to users in your organisation"). The Campus Head saves its link on the **Daily report** page (**Manage forms**).

**Google Doc** (adds a summary for a date range to a document) needs the Apps Script below:

1. Open <https://script.google.com> → New project → paste [docs/google-apps-script/Code.gs](docs/google-apps-script/Code.gs).
2. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**. Copy the Web app URL.
3. Put it in `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` (and later in Vercel).
4. Make sure the Google account that deployed the script can edit the target Google Doc.

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

Full step-by-step guide, environment variables and a go-live checklist: **[DEPLOYMENT.md](DEPLOYMENT.md)**. Short version:

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
