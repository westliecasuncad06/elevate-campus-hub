"use server";

import { revalidatePath } from "next/cache";
import { getActor, getCampus } from "@/lib/auth";
import { usesProgramList } from "@/lib/course";
import { todayInTimezone } from "@/lib/dates";
import { getActivePrograms } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseAccountForm } from "@/lib/validation";
import { fullName, type ActionResult, type Profile, type Role } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "Only a Super Admin can do that." };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND: ActionResult = { ok: false, error: "That person could not be found. They may already have been deleted." };

function refresh() {
  revalidatePath("/", "layout");
}

/** Escape the characters that act as wildcards in an `ilike` pattern, so an email is matched literally. */
function literal(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Names of the fields whose value differs, for the log (names only: never the personal data itself). */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => (before[key] ?? null) !== (after[key] ?? null));
}

/**
 * Super Admin: edit anyone's details, and (for Campus Heads, facilitators and students) which campus they belong to.
 * A Campus Head or facilitator can also become the other role, at any campus: that is how one person ends up heading
 * a different campus. Students stay students; Super Admins keep their role and have no campus.
 */
export async function updateUserAction(
  profileId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("*").eq("id", profileId).maybeSingle<Profile>();
  if (!target) return NOT_FOUND;

  // 1. Where they will be, and as what.
  let newRole: Role = target.role;
  let newCampusId: string | null = target.campus_id;
  if (target.role !== "super_admin") {
    newCampusId = String(formData.get("campus_id") ?? "") || null;
    if (!newCampusId) return { ok: false, error: "Select a campus." };
    if (target.role !== "student") {
      const picked = String(formData.get("role") ?? "");
      if (picked !== "campus_head" && picked !== "facilitator") return { ok: false, error: "Pick Campus Head or Facilitator." };
      newRole = picked;
    }
  }
  const campus = newCampusId ? await getCampus(newCampusId) : null;
  if (newCampusId && !campus) return { ok: false, error: "That campus couldn't be found." };

  // A facilitator can also work at other campuses (each with its own Campus Head). Nobody else can.
  const extraCampusIds =
    newRole === "facilitator"
      ? [...new Set(formData.getAll("extra_campus_ids").map(String).filter((id) => UUID.test(id) && id !== newCampusId))]
      : [];
  let campusesChanged = false;
  if (newRole === "facilitator" && target.role === "facilitator") {
    const { data: rows } = await admin.from("profile_campuses").select("campus_id").eq("profile_id", target.id);
    const before = new Set<string | null>([target.campus_id, ...(rows ?? []).map((r) => r.campus_id as string)]);
    const after = new Set<string | null>([newCampusId, ...extraCampusIds]);
    campusesChanged = before.size !== after.size || [...after].some((id) => !before.has(id));
  }
  const moved = newRole !== target.role || newCampusId !== target.campus_id || campusesChanged;
  if (moved && campus && !campus.is_active) return { ok: false, error: "Pick an active campus." };

  // 2. Their details. A campus with its own programs uses the dropdown; any other campus has students type the course.
  const supabase = await createClient();
  const programs = target.role === "student" ? await getActivePrograms(supabase, newCampusId) : [];
  const parsed = parseAccountForm(newRole, formData, todayInTimezone(campus?.timezone), {
    courseMode: usesProgramList(programs) ? "program" : "text",
    requireConsent: false, // consent was recorded when they were registered
  });
  if (!parsed.ok) return parsed;
  const fields = parsed.value;

  if (fields.programId && !programs.some((p) => p.id === fields.programId)) {
    // The one exception: keeping the program they already have, even if it was switched off since.
    const keepsOwn = newCampusId === target.campus_id && fields.programId === target.program_id;
    if (!keepsOwn) return { ok: false, error: "That program isn't available for this campus." };
  }

  // 3. Friendly duplicate checks (the database has unique indexes as the final guard).
  if (fields.email !== target.email.toLowerCase()) {
    const { data: emailTaken } = await admin.from("profiles").select("id").ilike("email", literal(fields.email)).neq("id", target.id).maybeSingle();
    if (emailTaken) return { ok: false, error: "Someone else is already registered with that email." };
  }
  if (fields.phone && newCampusId && (fields.phone !== target.phone || newCampusId !== target.campus_id)) {
    const { data: phoneTaken } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("campus_id", newCampusId)
      .eq("phone", fields.phone)
      .neq("id", target.id)
      .maybeSingle<{ first_name: string; last_name: string }>();
    if (phoneTaken) {
      return { ok: false, error: `That phone number already belongs to ${phoneTaken.first_name} ${phoneTaken.last_name} at this campus.` };
    }
  }

  // 4. Change campus / role first: it is all-or-nothing and the part most likely to be refused (for example while they
  // have an open batch), so nothing else is touched if it is.
  let endedAssignments = 0;
  if (moved) {
    // A facilitator needs a gender, and it may be set in this very form.
    if (fields.gender && !target.gender) await admin.from("profiles").update({ gender: fields.gender }).eq("id", target.id);
    const { data: result, error } = await admin.rpc("admin_move_user", {
      p_user: target.id,
      p_role: newRole,
      p_campus: newCampusId,
      p_extra: extraCampusIds,
    });
    if (error) return { ok: false, error: error.message };
    endedAssignments = Number((result as { ended_assignments?: number } | null)?.ended_assignments ?? 0);
  }

  // 5. Their details. The login email lives in the auth system too, so it is changed there first.
  const emailChanged = fields.email !== target.email.toLowerCase();
  if (emailChanged) {
    const { error } = await admin.auth.admin.updateUserById(target.id, { email: fields.email, email_confirm: true });
    if (error) return { ok: false, error: `${moved ? "Moved, but " : ""}couldn't change the email: ${error.message}` };
  }

  const isStudent = target.role === "student";
  const update = {
    first_name: fields.firstName,
    last_name: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    // Campus Heads don't have a gender field in the form: keep whatever is on file.
    gender: fields.gender ?? target.gender,
    birthday: fields.birthday,
    ...(isStudent
      ? {
          church: fields.church,
          religion: fields.religion,
          program_id: fields.programId,
          course: fields.course,
          year_level: fields.yearLevel,
          student_number: fields.studentNumber,
        }
      : {}),
  };
  const { error: updateError } = await admin.from("profiles").update(update).eq("id", target.id);
  if (updateError) {
    if (emailChanged) await admin.auth.admin.updateUserById(target.id, { email: target.email, email_confirm: true });
    const detail = updateError.code === "23505" ? "That email or phone number is already registered." : updateError.message;
    return { ok: false, error: `${moved ? "Moved, but " : ""}couldn't save the details: ${detail}` };
  }

  // 6. Keep the sign-in token's role and campus in step (the app itself always reads the database).
  if (moved) {
    const { error } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { role: newRole, campus_id: newCampusId } });
    if (error) {
      await admin.from("system_logs").insert({
        event: "user_metadata_sync_failed",
        level: "error",
        detail: { target_profile_id: target.id, error: error.message },
      });
    }
  }

  await admin.from("system_logs").insert({
    event: "user_updated",
    level: "info",
    detail: {
      target_profile_id: target.id,
      by: actor.id,
      fields: changedFields({ ...target, email: target.email.toLowerCase() }, { ...update }),
      ...(moved
        ? {
            from: { role: target.role, campus_id: target.campus_id },
            to: { role: newRole, campus_id: newCampusId, also_works_at: extraCampusIds },
          }
        : {}),
    },
  });

  refresh();
  if (!moved) return { ok: true, message: "Saved." };

  const alsoAt = extraCampusIds.length
    ? ((await admin.from("campuses").select("code").in("id", extraCampusIds).order("code")).data ?? []).map((c) => c.code as string)
    : [];
  const where = alsoAt.length ? `${campus?.code} (and also ${alsoAt.join(", ")})` : campus?.code;
  const assignments =
    endedAssignments > 0
      ? ` ${endedAssignments} student assignment${endedAssignments === 1 ? "" : "s"} ended; those students are matched again at their next meeting.`
      : "";
  return { ok: true, message: `Saved. ${fullName({ first_name: fields.firstName, last_name: fields.lastName })} is now ${ROLE_LABEL[newRole]} at ${where}.${assignments}` };
}

/**
 * Super Admin: permanently delete a person. A student's own records (attendance, engagement, chat, notifications) go
 * with them. Staff who have recorded attendance, run batches or sent reports can't be deleted, because those records
 * carry their name: deactivate them instead so the history stays whole.
 */
export async function deleteUserAction(profileId: string): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;
  if (profileId === actor.id) return { ok: false, error: "You can't delete your own account." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("*").eq("id", profileId).maybeSingle<Profile>();
  if (!target) return NOT_FOUND;
  if (target.role === "super_admin") return { ok: false, error: "Super Admin accounts can't be deleted here." };

  const count = async (table: string, column: string) => {
    const { count: n } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, profileId);
    return n ?? 0;
  };
  const records = (
    await Promise.all([
      count("attendance_logs", "scanned_by"),
      count("engagement_batches", "facilitator_id"),
      count("engagement_logs", "facilitator_id"),
      count("daily_reports", "submitted_by"),
      count("report_submissions", "submitted_by"),
    ])
  ).reduce((sum, n) => sum + n, 0);
  if (records > 0) {
    return {
      ok: false,
      error: `${fullName(target)} has ${records} record${records === 1 ? "" : "s"} in the system (attendance, batches or reports they made), so they can't be deleted without breaking the history. Deactivate them instead.`,
    };
  }

  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) return { ok: false, error: error.message };
  await admin.from("profiles").delete().eq("id", profileId); // normally already gone (it cascades from the login)

  await admin.from("system_logs").insert({
    event: "user_deleted",
    level: "info",
    detail: { role: target.role, campus_id: target.campus_id, by: actor.id },
  });

  refresh();
  return { ok: true, message: `${fullName(target)} was deleted.` };
}
