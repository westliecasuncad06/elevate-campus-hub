import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CODE_MAX_ATTEMPTS,
  CODE_MINUTES,
  codeMatches,
  generateCode,
  hashCode,
  hashToken,
  isWithinHours,
  newTrustToken,
  parseCodeInput,
} from "@/lib/email-code-core";
import { loginCodeEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/mailer";
import { checkRateLimits, clientIp, logBlock, rateKey, resetRateLimit, tooManyMessage } from "@/lib/rate-limit";
import type { Role } from "@/lib/types";

/**
 * The emailed sign-in code (see migration 0019). The settings, the codes and the "this session passed" records all live
 * in tables only the server can touch, and the DATABASE refuses a session that hasn't passed, so this file is the one
 * place those tables are written.
 */

export interface SecuritySettings {
  enabled: boolean;
  roles: Role[];
  hours: number;
  testOkAt: string | null;
}

const TRUST_COOKIE = "ech_trust";

function secret(): string {
  return process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "elevate-campus-hub";
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const { data } = await createAdminClient()
    .from("security_settings")
    .select("email_code_enabled, email_code_roles, email_code_hours, email_test_ok_at")
    .eq("id", true)
    .maybeSingle<{ email_code_enabled: boolean; email_code_roles: Role[]; email_code_hours: number; email_test_ok_at: string | null }>();
  return {
    enabled: data?.email_code_enabled ?? false,
    roles: data?.email_code_roles ?? ["student"],
    hours: data?.email_code_hours ?? 5,
    testOkAt: data?.email_test_ok_at ?? null,
  };
}

let settingsCache: { at: number; value: SecuritySettings } | null = null;

/** The settings, remembered for 10 seconds so ordinary page views don't ask the database each time. */
export async function getSecuritySettingsCached(): Promise<SecuritySettings> {
  if (settingsCache && Date.now() - settingsCache.at < 10_000) return settingsCache.value;
  const value = await getSecuritySettings();
  settingsCache = { at: Date.now(), value };
  return value;
}

/** Forget the remembered settings (after they were changed on this server). */
export function forgetSecuritySettings(): void {
  settingsCache = null;
}

/** Is the emailed code required of this person, and has this session already passed it? */
export async function emailGate(userId: string, sessionId: string | null): Promise<{ required: boolean; verified: boolean }> {
  const { data } = await createAdminClient().rpc("email_code_gate", {
    p_user: userId,
    p_session: sessionId ?? "00000000-0000-0000-0000-000000000000",
  });
  const row = Array.isArray(data) ? data[0] : data;
  return { required: Boolean(row?.required), verified: Boolean(row?.verified) };
}

/** Marks a session as having passed the check, until `expiresAt`. */
export async function markSessionVerified(sessionId: string, userId: string, expiresAt: Date): Promise<boolean> {
  const { error } = await createAdminClient().rpc("email_code_pass", {
    p_session: sessionId,
    p_user: userId,
    p_expires_at: expiresAt.toISOString(),
  });
  return !error;
}

export type SendCodeResult = { ok: true } | { ok: false; error: string };

/**
 * Makes a fresh code, stores only its hash, and emails it. At most one email per 30 seconds and five an hour per person,
 * so the "send me a code" button can't be used to flood someone's inbox (or to burn the email service's daily limit).
 */
export async function sendLoginCode(
  person: { id: string; email: string; first_name: string | null },
  purpose: "signin" | "test" = "signin",
): Promise<SendCodeResult> {
  const ip = await clientIp();
  const cooldown = await checkRateLimits([{ key: rateKey("code:send:cooldown", person.id), limit: 1, windowSeconds: 30 }]);
  if (!cooldown.ok) {
    return { ok: false, error: `A code was just sent. Please wait ${Math.max(1, cooldown.retryAfter)} seconds before asking for another one.` };
  }
  const rate = await checkRateLimits([
    { key: rateKey("code:send:user", person.id), limit: 5, windowSeconds: 3600 },
    { key: rateKey("code:send:ip", ip), limit: 40, windowSeconds: 3600 },
  ]);
  if (!rate.ok) {
    if (rate.firstBlock) await logBlock("code_send_blocked", { user_id: person.id, retry_after_seconds: rate.retryAfter });
    return { ok: false, error: tooManyMessage(rate.retryAfter) };
  }

  const admin = createAdminClient();
  const code = generateCode();
  const { error: saveError } = await admin.from("login_codes").upsert({
    user_id: person.id,
    code_hash: hashCode(secret(), person.id, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  if (saveError) return { ok: false, error: "We couldn't make a code right now. Please try again." };

  const message = loginCodeEmail({ code, minutes: CODE_MINUTES, firstName: person.first_name, purpose });
  const sent = await sendEmail({ to: person.email, ...message });
  if (!sent.ok) {
    await admin.from("login_codes").delete().eq("user_id", person.id);
    await logBlock("code_email_failed", { user_id: person.id, reason: sent.error });
    return { ok: false, error: "We couldn't send the email right now. Please try again in a few minutes, or sign in with Google." };
  }
  return { ok: true };
}

/** Is there a code waiting for this person (sent and not expired)? */
export async function hasActiveCode(userId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("login_codes").select("expires_at").eq("user_id", userId).maybeSingle<{ expires_at: string }>();
  return Boolean(data && new Date(data.expires_at).getTime() > Date.now());
}

export type VerifyCodeResult = { ok: true } | { ok: false; error: string };

/**
 * Checks what the person typed. Wrong guesses are counted three ways: 4 wrong tries in a row lock the person for 60
 * seconds, a code stops working after 5 wrong guesses, and it expires after 10 minutes.
 */
export async function verifyLoginCode(userId: string, rawCode: unknown): Promise<VerifyCodeResult> {
  const code = parseCodeInput(rawCode);
  if (!code) return { ok: false, error: "Type the 6-digit code from your email." };

  const quick = rateKey("code:verify:quick", userId);
  const slow = rateKey("code:verify:user", userId);
  const ip = await clientIp();
  const rate = await checkRateLimits([
    { key: quick, limit: 4, windowSeconds: 60, lockFromLimit: true },
    { key: slow, limit: 12, windowSeconds: 900 },
    { key: rateKey("code:verify:ip", ip), limit: 80, windowSeconds: 600 },
  ]);
  if (!rate.ok) {
    if (rate.firstBlock) await logBlock("code_verify_blocked", { user_id: userId, retry_after_seconds: rate.retryAfter });
    return { ok: false, error: tooManyMessage(rate.retryAfter) };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("login_codes")
    .select("code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .maybeSingle<{ code_hash: string; expires_at: string; attempts: number }>();
  const WRONG = "That code isn't right, or it has expired. Check the email, or ask for a new code.";
  if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, error: WRONG };

  if (!codeMatches(secret(), userId, code, row.code_hash)) {
    await admin.from("login_codes").update({ attempts: row.attempts + 1 }).eq("user_id", userId);
    return { ok: false, error: WRONG };
  }

  // A code works once.
  await admin.from("login_codes").delete().eq("user_id", userId);
  await Promise.all([resetRateLimit(quick), resetRateLimit(slow)]);
  return { ok: true };
}

/** The browser passed the check just now: remember that for `hours` hours (a random token in a cookie, its hash in the database). */
export async function rememberBrowser(userId: string, hours: number): Promise<void> {
  const token = newTrustToken();
  const admin = createAdminClient();
  await admin.from("login_trust").delete().eq("user_id", userId);
  await admin.from("login_trust").insert({ token_hash: hashToken(secret(), token), user_id: userId, verified_at: new Date().toISOString() });
  const jar = await cookies();
  jar.set(TRUST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: hours * 3600,
  });
}

/** If THIS browser passed the check for this person within `hours` hours, when it did. */
export async function trustedSince(userId: string, hours: number): Promise<Date | null> {
  const token = (await cookies()).get(TRUST_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const { data } = await createAdminClient()
    .from("login_trust")
    .select("verified_at, user_id")
    .eq("token_hash", hashToken(secret(), token))
    .maybeSingle<{ verified_at: string; user_id: string }>();
  if (!data || data.user_id !== userId || !isWithinHours(data.verified_at, hours)) return null;
  return new Date(data.verified_at);
}

/** When a check that happened at `verifiedAt` stops counting. */
export function verificationExpiry(verifiedAt: Date, hours: number): Date {
  return new Date(verifiedAt.getTime() + hours * 3_600_000);
}
