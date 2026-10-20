"use server";

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

/** The signed-in person accepts the current Data Privacy Notice themselves. */
export async function acceptPrivacyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");

  if (formData.get("privacy_consent") !== "on") {
    return { ok: false, error: "Please tick the box to accept the Data Privacy Notice and continue." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ privacy_accepted_at: new Date().toISOString(), privacy_accepted_version: PRIVACY_VERSION })
    .eq("id", profile.id);
  if (error) return { ok: false, error: "Couldn't save that. Try again." };

  redirect(ROLE_HOME[profile.role]);
}
