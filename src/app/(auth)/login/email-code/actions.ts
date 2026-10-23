"use server";

import { redirect } from "next/navigation";
import { currentSessionId, loadSessionProfile, secondStep } from "@/lib/auth";
import {
  getSecuritySettings,
  markSessionVerified,
  rememberBrowser,
  sendLoginCode,
  verificationExpiry,
  verifyLoginCode,
} from "@/lib/email-code";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult } from "@/lib/types";

/** The signed-in person who still owes the emailed code, or null when there is nothing to do (the page redirects them on). */
async function personOwingCode() {
  const profile = await loadSessionProfile();
  if (!profile || !profile.is_active) redirect("/login");
  const step = await secondStep(profile);
  return step === "email" ? profile : null;
}

/** "Email me a code" / "Send a new code". */
export async function sendEmailCodeAction(): Promise<ActionResult> {
  const profile = await personOwingCode();
  if (!profile) return { ok: false, error: "You don't need a code right now." };

  const sent = await sendLoginCode({ id: profile.id, email: profile.email, first_name: profile.first_name }, "signin");
  if (!sent.ok) return sent;
  return { ok: true, message: "We sent a new code. It can take a minute to arrive: check your spam folder too." };
}

/** The person types the code from their email. A right code lets this session in for the chosen number of hours. */
export async function verifyEmailCodeAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await personOwingCode();
  const next = safeNext(formData.get("next"));
  if (!profile) redirect(next ?? "/");

  const checked = await verifyLoginCode(profile.id, formData.get("code"));
  if (!checked.ok) return checked;

  const sessionId = await currentSessionId();
  if (!sessionId) return { ok: false, error: "Your sign-in expired. Please sign in again." };

  const { hours } = await getSecuritySettings();
  const now = new Date();
  const saved = await markSessionVerified(sessionId, profile.id, verificationExpiry(now, hours));
  if (!saved) return { ok: false, error: "The code was right, but we couldn't finish signing you in. Please try again." };
  // This browser won't be asked again until the hours are over (a re-sign-in within that time goes straight through).
  await rememberBrowser(profile.id, hours);

  redirect(next ?? ROLE_HOME[profile.role]);
}
