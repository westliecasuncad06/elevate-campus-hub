"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult } from "@/lib/types";

export async function setPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "The two passwords don't match." };

  // First-time setup (or a new notice version): the person must accept the Data Privacy Notice themselves.
  const needsPrivacy = profile.privacy_accepted_version !== PRIVACY_VERSION;
  if (needsPrivacy && formData.get("privacy_consent") !== "on") {
    return { ok: false, error: "Please read and accept the Data Privacy Notice to continue." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  // Profile columns are not writable through RLS, so use the service role.
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      password_changed: true,
      invitation_accepted_at: profile.invitation_accepted_at ?? now,
      ...(needsPrivacy ? { privacy_accepted_at: now, privacy_accepted_version: PRIVACY_VERSION } : {}),
    })
    .eq("id", profile.id);
  if (profileError) return { ok: false, error: "Password saved, but your profile could not be updated. Try again." };

  redirect(ROLE_HOME[profile.role]);
}
