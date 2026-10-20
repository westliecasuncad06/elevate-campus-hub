"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { checkRateLimits, rateKey, resetRateLimit, tooManyMessage } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

/**
 * Two-step verification with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…): after the
 * password, the person types a 6-digit code that changes every 30 seconds. It is optional and is switched on and off
 * here, by the person themselves. Signing in with Google is not asked for the code ("easy login").
 */

const FORBIDDEN: ActionResult<never> = { ok: false, error: "Please sign in again." };
const BAD_CODE = "That code isn't right, or it has expired. Wait for the next one and try again.";
const ANY_ROLE = ["super_admin", "campus_head", "facilitator", "student"] as const;

async function log(event: string, detail: Record<string, unknown>) {
  try {
    await createAdminClient().from("system_logs").insert({ event, level: "info", detail });
  } catch {
    // The log is for the Super Admin's information; never fail the action because of it.
  }
}

/** Step 1: make a new authenticator secret and hand back what the QR code and the "type this key" fallback need. */
export async function startTwoStepAction(): Promise<ActionResult<{ factorId: string; uri: string; secret: string }>> {
  const actor = await getActor(...ANY_ROLE);
  if (!actor) return FORBIDDEN;
  if (actor.mfa_enabled) return { ok: false, error: "Two-step verification is already on." };

  const rate = await checkRateLimits([{ key: rateKey("mfa:setup", actor.id), limit: 10, windowSeconds: 3600 }]);
  if (!rate.ok) return { ok: false, error: tooManyMessage(rate.retryAfter) };

  const supabase = await createClient();
  // A setup that was started and never finished leaves an unverified factor behind: clear those first.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Elevate ${Date.now()}`,
    issuer: "Elevate Campus Hub",
  });
  if (error || !data?.totp) {
    return { ok: false, error: "Two-step verification could not be started. If this keeps happening, ask IT to check that it is enabled in Supabase." };
  }
  return { ok: true, data: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret } };
}

/** Step 2: the person types the first code their app shows, which proves the app was set up correctly. */
export async function confirmTwoStepAction(factorId: string, rawCode: string): Promise<ActionResult> {
  const actor = await getActor(...ANY_ROLE);
  if (!actor) return FORBIDDEN;

  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const userKey = rateKey("mfa:user", actor.id);
  const rate = await checkRateLimits([{ key: userKey, limit: 6, windowSeconds: 300 }]);
  if (!rate.ok) return { ok: false, error: tooManyMessage(rate.retryAfter) };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, error: BAD_CODE };

  await resetRateLimit(userKey);
  const { error: saveError } = await createAdminClient().from("profiles").update({ mfa_enabled: true }).eq("id", actor.id);
  if (saveError) return { ok: false, error: "Two-step verification was set up but could not be saved. Try again." };

  await log("two_step_on", { user_id: actor.id });
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step verification is on. Next time you sign in with your password, you'll be asked for a code." };
}

/** Turning it off needs a current code, so a stolen session can't quietly remove the protection. */
export async function disableTwoStepAction(rawCode: string): Promise<ActionResult> {
  const actor = await getActor(...ANY_ROLE);
  if (!actor) return FORBIDDEN;

  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const userKey = rateKey("mfa:user", actor.id);
  const rate = await checkRateLimits([{ key: userKey, limit: 6, windowSeconds: 300 }]);
  if (!rate.ok) return { ok: false, error: tooManyMessage(rate.retryAfter) };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (factor) {
    const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verified.error) return { ok: false, error: BAD_CODE };
    const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removed.error) return { ok: false, error: "Two-step verification could not be turned off. Try again." };
  }

  await resetRateLimit(userKey);
  await createAdminClient().from("profiles").update({ mfa_enabled: false }).eq("id", actor.id);
  await log("two_step_off", { user_id: actor.id });
  revalidatePath("/", "layout");
  return { ok: true, message: "Two-step verification is off." };
}
