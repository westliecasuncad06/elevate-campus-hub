"use server";

import { redirect } from "next/navigation";
import { loadSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimits, clientIp, logBlock, rateKey, resetRateLimit, tooManyMessage } from "@/lib/rate-limit";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult } from "@/lib/types";

/**
 * The second step of a password sign-in: the 6-digit code from the person's authenticator app. A correct code upgrades
 * the session (the token now says aal2), which is what the app and the database both look for.
 */
export async function verifyTwoStepAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await loadSessionProfile();
  if (!profile || !profile.is_active) redirect("/login");

  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  // A 6-digit code has a million possibilities, so guessing is capped hard: a handful of tries, then a wait.
  const ip = await clientIp();
  const userKey = rateKey("mfa:user", profile.id);
  const quickKey = rateKey("mfa:quick", profile.id);
  const rate = await checkRateLimits([
    // 4 wrong codes, then 60 seconds; a slower guesser is held to 10 tries per 15 minutes.
    { key: quickKey, limit: 4, windowSeconds: 60, lockFromLimit: true },
    { key: userKey, limit: 10, windowSeconds: 900 },
    { key: rateKey("mfa:ip", ip), limit: 60, windowSeconds: 600 },
  ]);
  if (!rate.ok) {
    if (rate.firstBlock) await logBlock("two_step_blocked", { user_id: profile.id, retry_after_seconds: rate.retryAfter });
    return { ok: false, error: tooManyMessage(rate.retryAfter) };
  }

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) {
    // The flag says two-step is on but there is no factor (removed from the dashboard): put the flag right and carry on.
    await createAdminClient().from("profiles").update({ mfa_enabled: false }).eq("id", profile.id);
    redirect(safeNext(formData.get("next")) ?? ROLE_HOME[profile.role]);
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { ok: false, error: "That code isn't right, or it has expired. Wait for the next one and try again." };

  await Promise.all([resetRateLimit(userKey), resetRateLimit(quickKey)]);
  redirect(safeNext(formData.get("next")) ?? ROLE_HOME[profile.role]);
}
