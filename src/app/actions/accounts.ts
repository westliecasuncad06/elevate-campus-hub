"use server";

import { revalidatePath } from "next/cache";
import { getActor, getCampus } from "@/lib/auth";
import { createAccount, inviteStaffByEmail, resendInvitation, resetPasswordDirectly, setAccountActive } from "@/lib/accounts";
import { validateNewPassword } from "@/lib/password";
import { looksLikeEmail } from "@/lib/phone";
import { checkRateLimits, rateKey, tooManyMessage } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { usesProgramList } from "@/lib/course";
import { todayInTimezone } from "@/lib/dates";
import { getActivePrograms } from "@/lib/queries";
import { creatableRoles, parseAccountForm } from "@/lib/validation";
import type { ActionResult, Profile, Role } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "You don't have permission to do that." };

/** Invitations send real emails (and Supabase's sender is limited), so one person can only send so many an hour. */
async function emailLimit(actorId: string): Promise<ActionResult | null> {
  const rate = await checkRateLimits([{ key: rateKey("invite:user", actorId), limit: 40, windowSeconds: 3600 }]);
  return rate.ok ? null : { ok: false, error: tooManyMessage(rate.retryAfter) };
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Which campus a new account belongs to: the actor's own, or (Super Admin) the one picked in the form. */
function resolveCampusId(actor: Profile, formData: FormData): string | null {
  if (actor.role !== "super_admin") return actor.campus_id;
  const picked = formData.get("campus_id");
  return typeof picked === "string" && picked ? picked : null;
}

/** Create a Campus Head, Facilitator or Student account and email the invitation. */
export async function createAccountAction(
  role: Role,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin", "campus_head", "facilitator");
  if (!actor || !creatableRoles(actor.role).includes(role)) return FORBIDDEN;

  const campusId = resolveCampusId(actor, formData);
  if (!campusId) return { ok: false, error: "Select a campus." };
  const limited = await emailLimit(actor.id);
  if (limited) return limited;

  const campus = await getCampus(campusId);

  // A campus with its own programs gets a dropdown; any other campus has students type their course.
  const programs = await getActivePrograms(await createClient(), campusId);
  const parsed = parseAccountForm(role, formData, todayInTimezone(campus?.timezone), {
    courseMode: usesProgramList(programs) ? "program" : "text",
  });
  if (!parsed.ok) return parsed;

  if (parsed.value.programId && !programs.some((p) => p.id === parsed.value.programId)) {
    return { ok: false, error: "That program isn't available for this campus." };
  }

  const result = await createAccount({ role, campusId, fields: parsed.value, createdBy: actor.id });
  if (!result.ok) return result;

  refresh();
  const matched = result.rosterMatch ? ` Matched to the roster as ${result.rosterMatch}.` : "";
  return { ok: true, message: `Invitation sent to ${parsed.value.email}.${matched}` };
}

/**
 * Invite someone with just their email. They get a 6-digit code, register themselves and fill in their own details.
 * A Campus Head or facilitator can be invited this way by the Super Admin (and a Campus Head can invite facilitators);
 * a STUDENT can only be invited this way by the Super Admin. Facilitators and Campus Heads still register students with
 * their details.
 */
export async function inviteStaffAction(
  role: Role,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin", "campus_head");
  if (!actor || (role !== "campus_head" && role !== "facilitator" && role !== "student") || !creatableRoles(actor.role).includes(role)) {
    return FORBIDDEN;
  }
  if (role === "student" && actor.role !== "super_admin") return FORBIDDEN;

  const campusId = resolveCampusId(actor, formData);
  if (!campusId) return { ok: false, error: "Select a campus." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!looksLikeEmail(email)) return { ok: false, error: "Enter a valid email address." };
  const limited = await emailLimit(actor.id);
  if (limited) return limited;

  const campus = await getCampus(campusId);
  if (!campus || !campus.is_active) return { ok: false, error: "That campus isn't available." };

  const result = await inviteStaffByEmail({ role, campusId, email, createdBy: actor.id });
  if (!result.ok) return result;

  refresh();
  return { ok: true, message: `Invitation sent to ${email}. They register with the code in the email.` };
}

/** Can the actor manage this person (resend, deactivate)? */
async function loadManageable(actor: Profile, profileId: string): Promise<Profile | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", profileId).maybeSingle<Profile>();
  if (!data || data.id === actor.id) return null;
  if (actor.role === "super_admin") return data;
  // Campus Heads manage facilitators and students in their own campus only.
  if (actor.role === "campus_head" && data.campus_id === actor.campus_id && ["facilitator", "student"].includes(data.role)) {
    return data;
  }
  return null;
}

export async function resendInvitationAction(profileId: string): Promise<ActionResult> {
  const actor = await getActor("super_admin", "campus_head");
  if (!actor) return FORBIDDEN;
  const target = await loadManageable(actor, profileId);
  if (!target) return FORBIDDEN;
  const limited = await emailLimit(actor.id);
  if (limited) return limited;

  const result = await resendInvitation(target);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: `Invitation re-sent to ${target.email}.` };
}

export async function setActiveAction(profileId: string, active: boolean): Promise<ActionResult> {
  const actor = await getActor("super_admin", "campus_head");
  if (!actor) return FORBIDDEN;
  const target = await loadManageable(actor, profileId);
  if (!target) return FORBIDDEN;

  const result = await setAccountActive(profileId, active);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: active ? "Account activated." : "Account deactivated." };
}

/**
 * Someone lost their phone: remove their authenticator so they can sign in with just their password again (and turn
 * two-step back on with the new phone). The Super Admin can do this for anyone, a Campus Head for the facilitators and
 * students of their own campus, and nobody can do it for themselves (they turn it off with a code instead).
 */
export async function resetTwoStepAction(profileId: string): Promise<ActionResult> {
  const actor = await getActor("super_admin", "campus_head");
  if (!actor) return FORBIDDEN;
  const target = await loadManageable(actor, profileId);
  if (!target) return FORBIDDEN;

  const admin = createAdminClient();
  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: target.id });
  if (listError) return { ok: false, error: "Couldn't look up their two-step verification. Try again." };
  for (const factor of factors?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target.id });
    if (error) return { ok: false, error: "Couldn't remove their two-step verification. Try again." };
  }
  await admin.from("profiles").update({ mfa_enabled: false }).eq("id", target.id);
  await admin.from("system_logs").insert({ event: "two_step_reset", level: "info", detail: { target_profile_id: target.id, by: actor.id } });

  refresh();
  return { ok: true, message: `Two-step verification reset for ${target.first_name}. They can sign in with their password and turn it on again.` };
}

/** Super Admin only: set a new password for anyone without email verification. */
export async function resetPasswordAction(
  profileId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const password = String(formData.get("password") ?? "");
  const weak = validateNewPassword(password);
  if (weak) return { ok: false, error: weak };

  const result = await resetPasswordDirectly(profileId, password);
  if (!result.ok) return result;

  const admin = createAdminClient();
  await admin.from("system_logs").insert({
    event: "password_reset",
    level: "info",
    detail: { target_profile_id: profileId, by: actor.id },
  });
  refresh();
  return { ok: true, message: "Password reset. They'll choose a new one at next sign-in." };
}

/** Campus Head: move a student to another facilitator (or clear the assignment). */
export async function reassignFacilitatorAction(studentId: string, facilitatorId: string | null): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("profiles")
    .select("id, campus_id, role")
    .eq("id", studentId)
    .maybeSingle<Pick<Profile, "id" | "campus_id" | "role">>();
  if (!student || student.role !== "student" || student.campus_id !== actor.campus_id) return FORBIDDEN;

  if (facilitatorId) {
    const { data: facilitator } = await supabase
      .from("profiles")
      .select("id, campus_id, role, is_active, details_complete")
      .eq("id", facilitatorId)
      .maybeSingle<Pick<Profile, "id" | "campus_id" | "role" | "is_active" | "details_complete">>();
    // A facilitator can work at several campuses, so "from your campus" means one who works here, not only one set here.
    const { data: worksHere } = await supabase.rpc("works_at", { p_user: facilitatorId, p_campus: actor.campus_id });
    if (!facilitator || facilitator.role !== "facilitator" || !facilitator.is_active || !facilitator.details_complete || worksHere !== true) {
      return { ok: false, error: "Pick an active facilitator from your campus." };
    }
  }

  const { error: clearError } = await supabase
    .from("facilitator_students")
    .update({ is_active: false })
    .eq("student_id", studentId)
    .eq("is_active", true);
  if (clearError) return { ok: false, error: clearError.message };

  if (facilitatorId) {
    const { error: insertError } = await supabase.from("facilitator_students").insert({
      facilitator_id: facilitatorId,
      student_id: studentId,
      campus_id: actor.campus_id,
    });
    if (insertError) return { ok: false, error: insertError.message };
  }

  refresh();
  return { ok: true, message: facilitatorId ? "Facilitator updated." : "Assignment cleared." };
}
