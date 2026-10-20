# Security of Elevate Campus Hub

What protects the app and its data, what you still have to switch on yourself, and what to do if something looks wrong.
Plain words first; the technical part is at the end.

## What is already protected

| Danger | What stops it |
|---|---|
| **Guessing passwords** (bots, someone trying many passwords) | After **4 wrong passwords** the next try must wait **60 seconds** (the wait is counted from the 4th wrong try, and the message counts down). Slower guessing hits longer limits: 8 tries per 15 minutes for one email from one address, 25 per 15 minutes for one email from anywhere, 100 failed tries per 10 minutes for one address. A correct password never counts against anyone, so a whole class signing in from one Wi-Fi isn't locked out. The same message appears for a wrong email and a wrong password, so nobody can find out who has an account. |
| **Guessing the registration code or the two-step code** | Same rule: 4 wrong tries, then a 60-second wait, plus longer limits. |
| **Bots and scripts** | A hidden form box that only bots fill in, and an optional free **Cloudflare Turnstile** check (see "Switch on" below). |
| **Flooding the invitation emails** | One person can send 40 invitation emails an hour. Student look-ups are limited too. |
| **Someone who knows a password** | **Two-step verification** (optional, per person): after the password, a 6-digit code from an authenticator app. It is enforced **by the database**, not only by the screens, so a password alone gets nothing even if someone skips the app and talks to the database directly. Signing in **with Google** is the easy login and is not asked for the code. |
| **Weak passwords** | New passwords need **10+ characters**, can't be a common password (password123, qwerty…), can't be a run like 12345678, and can't contain the person's email name. |
| **SQL injection** | The app never builds SQL text: every query goes through Supabase's query builder, which sends values separately from the command, and the stored functions use parameters. The few search boxes that feed a filter (`.or(...)`) are cleaned first (`src/lib/postgrest.ts`: only letters, numbers, spaces and `@ . + ' -`, max 60 characters), and ids put into a filter must be real UUIDs. |
| **Cross-site scripting (a script injected into a page)** | A strict **Content-Security-Policy** with a fresh random nonce per page: the browser only runs the app's own scripts, and refuses injected inline scripts, inline event handlers and scripts from other sites. React also escapes everything it displays, and the code never uses `dangerouslySetInnerHTML`. |
| **Clickjacking, content sniffing, referrer leaks** | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera only for the QR scanner), and HTTPS-only (`Strict-Transport-Security`). `X-Powered-By` is off. |
| **Cross-site request forgery** | Next.js checks that every form action comes from this site (origin check), cookies are same-site, and redirects after sign-in only accept paths on this site. |
| **Reading other people's data** | Row Level Security on every table (tested: `npm run db:selftest`, `npm run verify:rls`): a student sees only themselves, a Campus Head only their campus, and the service-role key never leaves the server. |
| **A leaked file/secret** | `.env.local` is never committed; the service-role key is server-only; the cron endpoint needs `CRON_SECRET`. |
| **Vulnerable libraries** | `npm audit --omit=dev` reports 0 problems (the `shadcn` command-line tool, which had warnings, is a build-time tool only). Run it now and then. |
| **DDoS** | Vercel absorbs network-level floods automatically; the limits above stop attempts that reach the app. See "Switch on" for the extra shield. |

## Two-step verification (for everyone who wants it)

- Everyone: **Account & security** (bottom of the side menu, or **More** on a phone) → **Turn on two-step verification** → scan the QR code
  with Google Authenticator, Microsoft Authenticator or Authy → type the first code. Students can do it from their own menu; staff can too.
- Signing in with a password then asks for the code; **Continue with Google** does not.
- **Lost the phone?** The Super Admin (anyone) or the Campus Head (their facilitators and students) presses **Reset 2-step** next to the
  person's name. The person signs in with their password and turns it on again. It is logged in **System logs**.
- To turn it off yourself you need a current code (so a stolen session can't quietly remove it).

## Switch on (things only you can do, all free)

1. **Supabase → Authentication → Sign In / Providers → Email**: keep **Allow new users to sign up OFF**. Keep **Confirm email** on.
   (In Supabase's *Attack protection* / *Rate limits* settings, leave the built-in limits on.)
2. **Supabase → Authentication → Sign In / Providers**: leave *Allow manual linking* **off** (so nobody can attach their own Google account to someone else's login).
3. **Supabase → Authentication → Attack Protection**: turn on **Prevent use of leaked passwords** if your plan offers it (Pro).
4. **Cloudflare Turnstile** (optional bot check, free): <https://dash.cloudflare.com> → Turnstile → **Add site** (hostname `elevate-campus-hub.vercel.app`) →
   copy the **Site key** and **Secret key**. In **Vercel → Settings → Environment Variables** add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (the site key) and
   `TURNSTILE_SECRET_KEY` (the secret key, mark it Sensitive), then **Redeploy**. A small check then appears on the sign-in and register forms.
5. **Vercel → Firewall**: turn on **Bot Protection** (free, challenge mode for bots), and if the site is ever attacked, switch **Attack Challenge Mode** on for a while.
6. **Vercel → Settings → Environment Variables**: set `RATE_LIMIT_SECRET` to a long random text (optional; the counters otherwise use a value derived from the service key).
7. Use a **strong, unique password for the Super Admin**, turn on **two-step verification** for the Super Admin and every Campus Head, and
   add a **second Super Admin** (a person you trust) so a lost phone never locks you out.
8. Rotate the Supabase database password and service-role key if either was ever pasted into a chat or a file.

## If something looks wrong

- Many `login_blocked` rows in **Super Admin → System logs** means someone is guessing passwords. Nothing to do (they are being stopped); consider switching Turnstile
  and Vercel Attack Challenge Mode on, and ask the targeted person to change their password and turn on two-step verification.
- Someone says their account was used by another person: **Users → Reset password**, **Reset 2-step** if it was on, then have them turn it on again, and check **Deactivate** while you sort it out.
- Report a security problem to the Super Admin straight away; don't post it in a group chat.

## Technical notes

- Rate limits: `public.rate_limits` + `rate_limit_hit()` (migrations 0017, 0018), keys are HMAC hashes (no emails or addresses stored as text), cleaned by the keep-alive cron. Code: `src/lib/rate-limit.ts`.
  If the counters can't be reached a request is let through (a database hiccup must not lock everybody out).
- Two-step: Supabase MFA (TOTP). `profiles.mfa_enabled` is only a UX flag; the truth is `auth.mfa_factors`, checked by `public.mfa_ok()`. The API runs `public.enforce_mfa()` before every request
  (`alter role authenticator set pgrst.db_pre_request`), which refuses a request from a password-only (aal1) session of anyone with a verified factor with HTTP 403 / `PT403`.
  Realtime goes around that hook, so `chat_messages` and `notifications` also carry restrictive policies. Google sessions (`amr` contains `oauth`) pass.
  To switch the hook off in an emergency: `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`.
- Headers: `next.config.ts` (static headers) and `src/proxy.ts` + `src/lib/csp.ts` (the nonce CSP). The QR scanner loads its decoder from `fastly.jsdelivr.net`, which is the only extra address allowed in `connect-src`.
- Tests: `npm test` (password rules, search cleaning, CSP, wait messages), `npm run db:selftest` (rate limits, two-step enforcement, RLS).
