"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/accounts";
import { isBot, verifyTurnstile } from "@/lib/bot-guard";
import { sessionIdFromToken } from "@/lib/email-code-core";
import {
  emailGate,
  getSecuritySettings,
  markSessionVerified,
  sendLoginCode,
  trustedSince,
  verificationExpiry,
} from "@/lib/email-code";
import { checkRateLimits, clientIp, logBlock, rateKey, refundRateLimit, resetRateLimit, tooManyMessage } from "@/lib/rate-limit";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult, Profile } from "@/lib/types";

const WRONG = "Email or password is incorrect.";

/**
 * "Continue with Google": sends the person to Google, which sends them back to /auth/callback. Only accounts that were
 * invited can finish signing in (the callback checks), because public sign-ups are off in Supabase.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const ip = await clientIp();
  const rate = await checkRateLimits([{ key: rateKey("google:ip", ip), limit: 60, windowSeconds: 600 }]);
  if (!rate.ok) redirect("/login?error=too_many");

  const callback = new URL("/auth/callback", await siteUrl());
  const next = safeNext(formData.get("next"));
  if (next) callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // Let people with several Google accounts pick the right one instead of silently using the last one.
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=google_failed");
  redirect(data.url);
}

/**
 * Email + password sign-in, with the guards a public login needs:
 *  - a hidden field only bots fill in, and (when set up) a Cloudflare Turnstile check;
 *  - rate limits on failed tries: per address, per email, and per email+address, so passwords can't be guessed in bulk;
 *  - the same message for a wrong email and a wrong password, so it can't be used to find out who has an account.
 * If the account has two-step verification on, the person is sent on to enter their code before anything else.
 */
export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  // A bot that filled in the hidden box gets the same answer as a wrong password, and costs us nothing.
  if (isBot(formData)) return { ok: false, error: WRONG };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  if (email.length > 254 || password.length > 256) return { ok: false, error: WRONG };

  const ip = await clientIp();
  const keys = {
    ip: rateKey("login:ip", ip),
    quick: rateKey("login:quick", email, ip),
    pair: rateKey("login:email+ip", email, ip),
    email: rateKey("login:email", email),
  };
  // Every attempt is counted BEFORE it is tried (so a flood of simultaneous requests can't all slip through) and the
  // counters are cleared / refunded when the sign-in turns out to be a success.
  const rate = await checkRateLimits([
    { key: keys.ip, limit: 100, windowSeconds: 600 },
    // 4 wrong passwords in a row, then the 5th try has to wait 60 seconds...
    { key: keys.quick, limit: 4, windowSeconds: 60, lockFromLimit: true },
    // ...and a slower guesser (4 a minute, all day) hits the longer limits: 8 tries in 15 minutes, 25 per email.
    { key: keys.pair, limit: 8, windowSeconds: 900 },
    { key: keys.email, limit: 25, windowSeconds: 900 },
  ]);
  if (!rate.ok) {
    if (rate.firstBlock) await logBlock("login_blocked", { reason: "too many sign-in attempts", retry_after_seconds: rate.retryAfter });
    return { ok: false, error: tooManyMessage(rate.retryAfter) };
  }
  if (!(await verifyTurnstile(formData, ip))) {
    return { ok: false, error: "Please complete the check below the password box, then sign in again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: WRONG };

  // The password was right: this was not a guess, so it stops counting against this email and this address.
  await Promise.all([resetRateLimit(keys.quick), resetRateLimit(keys.pair), resetRateLimit(keys.email), refundRateLimit(keys.ip)]);

  // Read with the server's key: a session that still owes its two-step code can't read the database yet.
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("id, email, first_name, role, is_active, password_changed, mfa_enabled")
    .eq("id", data.user.id)
    .maybeSingle<Pick<Profile, "id" | "email" | "first_name" | "role" | "is_active" | "password_changed" | "mfa_enabled">>();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, error: "Your account has no profile yet. Ask your Campus Head or IT to check it." };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, error: "This account is deactivated. Contact your Campus Head or IT." };
  }

  const next = safeNext(formData.get("next"));
  const withNext = (path: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(extra);
    if (next) params.set("next", next);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  // An authenticator app is the stronger second step, so someone who has one uses that.
  if (profile.mfa_enabled) redirect(withNext("/login/verify"));

  // The school asks for a code by email (when the Super Admin has switched that on for this role).
  const settings = await getSecuritySettings();
  if (settings.enabled && settings.roles.includes(profile.role)) {
    const sessionId = sessionIdFromToken(data.session?.access_token);
    const gate = sessionId ? await emailGate(profile.id, sessionId) : { required: true, verified: false };
    if (gate.required && !gate.verified) {
      // This browser passed the check recently: a new sign-in within the hours goes straight through.
      const since = sessionId ? await trustedSince(profile.id, settings.hours) : null;
      if (sessionId && since) {
        await markSessionVerified(sessionId, profile.id, verificationExpiry(since, settings.hours));
      } else {
        const sent = await sendLoginCode({ id: profile.id, email: profile.email, first_name: profile.first_name }, "signin");
        redirect(withNext("/login/email-code", { sent: sent.ok ? "1" : "0" }));
      }
    }
  }

  if (!profile.password_changed) redirect("/set-password");

  redirect(next ?? ROLE_HOME[profile.role]);
}
