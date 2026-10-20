"use server";

import { redirect } from "next/navigation";
import { looksLikeEmail } from "@/lib/phone";
import { parseRegistrationCode } from "@/lib/registration";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const WRONG_CODE =
  "That code didn't work. Check the digits, or ask for a new invitation: a code works once and only for a limited time.";

/**
 * Registration with the code from the invitation email. A correct code signs the person in, and they carry on to
 * "Complete your registration" (their name, details and password).
 */
export async function registerWithCode(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = parseRegistrationCode(String(formData.get("code") ?? ""));
  if (!looksLikeEmail(email)) return { ok: false, error: "Enter the email address the invitation was sent to." };
  if (!code) return { ok: false, error: "Enter the code from your email (digits only)." };

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email, token: code, type: "invite" });
  if (error) {
    // Someone who had already opened an earlier invitation gets a "choose your password" email instead (same kind of code).
    ({ error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" }));
  }
  // The same answer for a wrong code, an expired one and an unknown email, so this can't be used to find out who has an account.
  if (error) return { ok: false, error: WRONG_CODE };

  redirect("/set-password");
}
