"use server";

import { revalidatePath } from "next/cache";
import { currentSessionId, getActor } from "@/lib/auth";
import { forgetSecuritySettings, getSecuritySettings, markSessionVerified, sendLoginCode, verificationExpiry, verifyLoginCode } from "@/lib/email-code";
import { isWithinHours } from "@/lib/email-code-core";
import { mailerStatus } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, Role } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "Only a Super Admin can change security settings." };
const ROLES: Role[] = ["student", "facilitator", "campus_head", "super_admin"];
const HOURS = [1, 2, 3, 5, 8, 12, 24, 48, 72, 168];
/** A test code counts for this many hours: long enough to finish the setup, short enough that email still works when it is switched on. */
const TEST_VALID_HOURS = 24;

/** Step 1 of switching the emailed code on: a test code to the Super Admin's own email, to prove emails really arrive. */
export async function sendTestCodeAction(): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;
  const status = mailerStatus();
  if (!status.configured) return { ok: false, error: status.problem ?? "Email sending isn't set up yet." };

  const sent = await sendLoginCode({ id: actor.id, email: actor.email, first_name: actor.first_name }, "test");
  if (!sent.ok) return sent;
  return { ok: true, message: `A test code was sent to ${actor.email}. It can take a minute: check spam too.` };
}

/** Step 2: the Super Admin types the test code. A right one proves email works, which unlocks the switch. */
export async function verifyTestCodeAction(rawCode: string): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const checked = await verifyLoginCode(actor.id, rawCode);
  if (!checked.ok) return checked;

  const { error } = await createAdminClient()
    .from("security_settings")
    .update({ email_test_ok_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, error: "The code was right, but it couldn't be saved. Try again." };

  forgetSecuritySettings();
  revalidatePath("/admin/security");
  return { ok: true, message: "Email sending works. You can switch the step on now." };
}

/** Saves who is asked for the emailed code, and for how many hours one check lasts. */
export async function saveSecuritySettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const enabled = formData.get("enabled") === "on";
  const roles = ROLES.filter((r) => formData.getAll("roles").includes(r));
  const hours = Number(formData.get("hours"));
  if (!HOURS.includes(hours)) return { ok: false, error: "Pick how many hours a check lasts." };
  if (enabled && roles.length === 0) return { ok: false, error: "Tick at least one group of people to ask for the code." };

  const before = await getSecuritySettings();
  if (enabled) {
    const status = mailerStatus();
    if (!status.configured) return { ok: false, error: status.problem ?? "Email sending isn't set up yet." };
    if (!before.testOkAt || !isWithinHours(before.testOkAt, TEST_VALID_HOURS)) {
      return { ok: false, error: "Send yourself a test code and type it first, so we know the emails really arrive." };
    }
  }

  const { error } = await createAdminClient()
    .from("security_settings")
    .update({
      email_code_enabled: enabled,
      email_code_roles: roles.length > 0 ? roles : before.roles,
      email_code_hours: hours,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq("id", true);
  if (error) return { ok: false, error: "Couldn't save the settings. Try again." };

  // If the Super Admin is one of the people being asked, they just proved email works: don't lock them out of their own page.
  if (enabled && roles.includes("super_admin")) {
    const sessionId = await currentSessionId();
    if (sessionId) await markSessionVerified(sessionId, actor.id, verificationExpiry(new Date(), hours));
  }

  await createAdminClient().from("system_logs").insert({
    event: "email_code_settings",
    level: "info",
    detail: { by: actor.id, enabled, roles, hours },
  });

  forgetSecuritySettings();
  revalidatePath("/admin/security");
  return {
    ok: true,
    message: enabled
      ? "Saved. The emailed code is ON: people signed in with a password will be asked for a code on their next click."
      : "Saved. The emailed code is OFF.",
  };
}
