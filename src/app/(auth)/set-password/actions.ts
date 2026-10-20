"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCampus, getSessionProfile, isGoogleSession } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import { parseAccountForm } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

export async function setPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  // Someone who signed in with Google has already proven who they are, so for them a password is optional.
  const choosePassword = !(await isGoogleSession()) || password !== "" || confirm !== "";
  if (choosePassword) {
    if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
    if (password !== confirm) return { ok: false, error: "The two passwords don't match." };
  }

  // First-time setup (or a new notice version): the person must accept the Data Privacy Notice themselves.
  const needsPrivacy = profile.privacy_accepted_version !== PRIVACY_VERSION;
  if (needsPrivacy && formData.get("privacy_consent") !== "on") {
    return { ok: false, error: "Please read and accept the Data Privacy Notice to continue." };
  }

  // Invited by email only: this is where they tell us who they are. The same checks as when someone else registers them
  // (names, phone, a facilitator's gender, a sensible birthday), minus the consent tick: they accept the notice above.
  const admin = createAdminClient();
  let details: { firstName: string; lastName: string; phone: string | null; gender: string | null; birthday: string | null } | null = null;
  if (!profile.details_complete) {
    const own = new FormData();
    for (const [key, value] of formData.entries()) own.set(key, value);
    own.set("email", profile.email); // never taken from the form: it is the address they signed in with
    const campus = await getCampus(profile.campus_id);
    const parsed = parseAccountForm(profile.role, own, todayInTimezone(campus?.timezone), { requireConsent: false });
    if (!parsed.ok) return parsed;
    details = parsed.value;

    if (details.phone && profile.campus_id) {
      const { data: phoneTaken } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("campus_id", profile.campus_id)
        .eq("phone", details.phone)
        .neq("id", profile.id)
        .maybeSingle<{ first_name: string; last_name: string }>();
      if (phoneTaken) {
        return { ok: false, error: `That phone number already belongs to ${phoneTaken.first_name} ${phoneTaken.last_name} at this campus.` };
      }
    }
  }

  if (choosePassword) {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: error.message };
  } else if (!profile.password_changed) {
    // Google only: replace the temporary password this account may still have (set by IT) with one nobody knows, so
    // the person signing in with Google is the only one who can get in. They can ask IT for a new password later.
    const { error } = await admin.auth.admin.updateUserById(profile.id, { password: randomBytes(32).toString("base64url") });
    if (error) return { ok: false, error: "Your account could not be finished. Try again." };
  }

  // Profile columns are not writable through RLS, so use the service role.
  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      password_changed: true,
      invitation_accepted_at: profile.invitation_accepted_at ?? now,
      ...(needsPrivacy ? { privacy_accepted_at: now, privacy_accepted_version: PRIVACY_VERSION } : {}),
      ...(details
        ? {
            first_name: details.firstName,
            last_name: details.lastName,
            phone: details.phone,
            gender: details.gender ?? profile.gender,
            birthday: details.birthday,
            details_complete: true,
            // They gave their own details and accepted the notice in the same step.
            data_consent_at: now,
            data_consent_version: PRIVACY_VERSION,
            data_consent_by: profile.id,
          }
        : {}),
    })
    .eq("id", profile.id);
  if (profileError) {
    const detail = profileError.code === "23505" ? "That phone number is already registered." : "Password saved, but your profile could not be updated. Try again.";
    return { ok: false, error: detail };
  }

  redirect(ROLE_HOME[profile.role]);
}
