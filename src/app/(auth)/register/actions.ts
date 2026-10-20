"use server";

import { redirect } from "next/navigation";
import { isBot, verifyTurnstile } from "@/lib/bot-guard";
import { looksLikeEmail } from "@/lib/phone";
import { checkRateLimits, clientIp, logBlock, rateKey, refundRateLimit, resetRateLimit, tooManyMessage } from "@/lib/rate-limit";
import { parseRegistrationCode } from "@/lib/registration";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const WRONG_CODE =
  "That code didn't work. Check the digits, or ask for a new invitation: a code works once and only for a limited time.";

/**
 * Registration with the code from the invitation email. A correct code signs the person in, and they carry on to
 * "Complete your registration" (their name, details and password).
 *
 * The code is only 6 to 10 digits, so guessing it is the thing to stop: attempts are counted per email, per
 * email + address and per address (a few tries, then a wait), and a hidden field / Turnstile keep bots out.
 */
export async function registerWithCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (isBot(formData)) return { ok: false, error: WRONG_CODE };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = parseRegistrationCode(String(formData.get("code") ?? ""));
  if (!looksLikeEmail(email) || email.length > 254) return { ok: false, error: "Enter the email address the invitation was sent to." };
  if (!code) return { ok: false, error: "Enter the code from your email (digits only)." };

  const ip = await clientIp();
  const keys = {
    ip: rateKey("register:ip", ip),
    quick: rateKey("register:quick", email, ip),
    pair: rateKey("register:email+ip", email, ip),
    email: rateKey("register:email", email),
  };
  const rate = await checkRateLimits([
    { key: keys.ip, limit: 60, windowSeconds: 600 },
    { key: keys.quick, limit: 4, windowSeconds: 60, lockFromLimit: true },
    { key: keys.pair, limit: 8, windowSeconds: 900 },
    { key: keys.email, limit: 15, windowSeconds: 900 },
  ]);
  if (!rate.ok) {
    if (rate.firstBlock) await logBlock("register_blocked", { reason: "too many code attempts", retry_after_seconds: rate.retryAfter });
    return { ok: false, error: tooManyMessage(rate.retryAfter) };
  }
  if (!(await verifyTurnstile(formData, ip))) {
    return { ok: false, error: "Please complete the check below the code box, then continue again." };
  }

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email, token: code, type: "invite" });
  if (error) {
    // Someone who had already opened an earlier invitation gets a "choose your password" email instead (same kind of code).
    ({ error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" }));
  }
  // The same answer for a wrong code, an expired one and an unknown email, so this can't be used to find out who has an account.
  if (error) return { ok: false, error: WRONG_CODE };

  await Promise.all([resetRateLimit(keys.quick), resetRateLimit(keys.pair), resetRateLimit(keys.email), refundRateLimit(keys.ip)]);
  redirect("/set-password");
}
