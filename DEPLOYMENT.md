# Deploying Elevate Campus Hub

The app runs on **Vercel** (the website) and uses **Supabase** (database, sign-in, realtime), which you already have.
Nothing else is needed.

## 1. Before you start

- The code is on GitHub (`main` branch) and `npm run build` passes.
- The database is already migrated (`npm run db:migrate` reports "up to date").
- Pick the project name you will give Vercel. Your address will be `https://<project-name>.vercel.app`.

## 2. Create the Vercel project

1. Sign in at <https://vercel.com> with GitHub.
2. **Add New → Project** → import `elevate-campus-hub`.
3. Leave **Framework Preset** = Next.js and **Root Directory** = `./`. Don't change the build settings.
4. Before pressing **Deploy**, open **Environment Variables** and add the variables below (apply to **Production** and **Preview**).

### Environment variables

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as `.env.local` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as `.env.local` | the publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | same as `.env.local` | **secret**: mark it *Sensitive* in Vercel |
| `NEXT_PUBLIC_SITE_URL` | `https://<project-name>.vercel.app` | **required**: invitation links are built from it |
| `CRON_SECRET` | a long random string (32+ chars) | the keep-alive job checks it |
| `GOOGLE_APPS_SCRIPT_WEBHOOK_URL` | the Apps Script web app URL | only for the "Send to a Google Doc" report; the Google Form needs no variable |
| `NEXT_PUBLIC_PRIVACY_CONTACT` | e.g. `dpo@yourchurch.org` | optional; shown in the Data Privacy Notice |

Do **not** add `SUPABASE_DB_URL`, `SEED_*` or `DEMO_*`: they are only for your own computer.
`NEXT_PUBLIC_*` values are baked into the build, so after changing one you must **Redeploy**.

Generate a `CRON_SECRET` in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

5. Press **Deploy**. If you did not know the address yet, deploy once, copy the address Vercel gives you, set
   `NEXT_PUBLIC_SITE_URL` to it, then **Deployments → ⋯ → Redeploy**.

`vercel.json` already sets the function region to Sydney (`syd1`, next to the Supabase database) and the keep-alive cron.

## 3. Tell Supabase about the new address

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://<project-name>.vercel.app`, the address people type to open the app (for this project:
  `https://elevate-campus-hub.vercel.app`). **Not** the `vercel.com/<team>/<project>` link you see inside the Vercel dashboard:
  that is a different page and gives a 404 for everyone else.
- **Redirect URLs**: add `https://<project-name>.vercel.app/**` and keep `http://localhost:3000/**` for local work.

While testing, invitation emails always point at the **Site URL**. Switch it back to `http://localhost:3000` only if you
are testing invitations locally.

### The branded emails (invitation and password)

Supabase sends these emails, and their design lives in Supabase, not in this repo. Two ways to apply
[docs/email-templates/](docs/email-templates/):

- **By hand**: Supabase → **Authentication → Email Templates** → *Invite user* and *Reset password*: paste the subject and the HTML
  (from the `<!doctype html>` line down) of `invite.html` / `recovery.html`.
- **By script**: create an access token (Supabase → your account → **Access Tokens**), put it in `.env.local` as
  `SUPABASE_ACCESS_TOKEN=`, then run `npm run supabase:email-templates`. To also set the Site URL and allowed Redirect
  URLs from step 3: `node --env-file=.env.local scripts/apply-email-templates.mjs --site-url https://<project-name>.vercel.app`.
  The token can manage all your Supabase projects, so delete it afterwards.

**The invitation now carries a registration code** (people invited with just their email register at `/register`). After
pasting the new `invite.html`, also set **Authentication → Providers → Email → Email OTP Length** to **6** (new projects default
to 8) and choose a longer **Email OTP Expiration** (for example 24 hours), otherwise the code stops working after an hour.
Re-sending the invitation always makes a fresh code.

**The emails contain no images** (the "ELEVATE CAMPUS HUB" name and the tagline are plain HTML text), so there is nothing to show up
broken, and an email app that blocks pictures still looks right. Their links point straight at
`https://elevate-campus-hub.vercel.app`, written into the templates, so they work even if Supabase's Site URL is wrong. If the
app ever moves to another address, change those links in `docs/email-templates/invite.html` and `recovery.html` (search for
`elevate-campus-hub.vercel.app`) and paste the templates into Supabase again.

## 4. Check it works

1. Open the address: you should see the landing page. **Sign in** with a real account.
2. Super Admin → **Users** → add a test person with an email you own → open the invitation email → set a password.
3. **Keep-alive cron**: Vercel → project → **Settings → Cron Jobs** → run `/api/cron/keep-alive`. In the app,
   Super Admin → **Overview** → "Database keep-alive" should say *Healthy* with a fresh time. (Crons only run on the
   **Production** deployment. Hobby plans run them once a day at most; ours is every 3 days.)
4. Try the scanner on a real phone (the camera needs the https address).

## 5. Before real students use it

- [ ] Remove the demo accounts (`demo.*@example.test`): Super Admin → Users → Deactivate, or delete them in Supabase.
- [ ] Change the database password (Supabase → Project Settings → Database) and update `SUPABASE_DB_URL` locally.
- [ ] Have your Data Protection Officer / legal counsel review the notice in `src/lib/privacy.ts` (then bump `PRIVACY_VERSION`).
- [ ] Check **Campuses → Edit** has the School/Location for each campus (GRC is already set). Each Campus Head saves their Google Form(s) on the Daily report page (**Manage forms**); GRC's is already saved, and it must accept responses without a sign-in.
- [ ] Send one real report from **Daily report → Send to Google Form** and check it arrives in the form's responses.
- [ ] Only if you use "Send to a Google Doc": set up the Google Apps Script (`docs/google-apps-script/Code.gs`) and add `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`.
- [ ] Paste the branded email templates (`docs/email-templates/`) into Supabase if you haven't.
- [ ] Keep the SMTP provider's sending limits in mind (Supabase → Authentication → SMTP Settings).
- [ ] Vercel's free **Hobby** plan is for personal, non-commercial use. If this is run officially by an organisation, check
      Vercel's terms and consider the Pro plan.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Almost there: connect Supabase" page | The two `NEXT_PUBLIC_SUPABASE_*` variables are missing or still placeholders. Add them and redeploy. |
| Invitation button opens `localhost` | Three things decide the address, all must be the Vercel URL: (1) Supabase → Authentication → URL Configuration → **Site URL** (the email button is built from it), (2) `NEXT_PUBLIC_SITE_URL` in **Vercel** (if it is missing the app uses the address the request came in on), (3) send the invitation **from the deployed site**, not from `npm run dev`: a local app uses your local `.env.local`. Hover the email button to see where it points; old emails keep their old address, so send a new invitation. |
| Invitation link says it expired / redirects to login | Add the Vercel address to Supabase **Redirect URLs**; links are single-use. |
| Sign-in loops or logs you out | Check the `SUPABASE_SERVICE_ROLE_KEY` and that the Site URL is `https`. |
| Cron shows 401 | `CRON_SECRET` is missing in Vercel. Add it (Production) and redeploy. |
| Pages are slow | Confirm the function region is `syd1` (Project → Settings → Functions). |
