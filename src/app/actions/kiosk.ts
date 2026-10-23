"use server";

import { getActor, getCampus } from "@/lib/auth";
import { createAccount } from "@/lib/accounts";
import { usesProgramList } from "@/lib/course";
import { todayInTimezone } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { getActivePrograms } from "@/lib/queries";
import { checkRateLimits, rateKey, tooManyMessage } from "@/lib/rate-limit";
import { parseStudentNumber } from "@/lib/student-number";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseAccountForm } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

export type KioskKind = "student_number" | "phone";

/** What the kiosk shows next: a welcome for a student who is checked in, or "no account yet" for a number we don't know. */
export type KioskOutcome =
  | { status: "welcome"; name: string }
  | { status: "no_account"; kind: KioskKind; value: string };

const FORBIDDEN: ActionResult<never> = { ok: false, error: "The kiosk can only be used from a Campus Head account." };

/** Records today's attendance for a student (once a day: checking in again changes nothing). */
async function recordAttendance(campusId: string, studentId: string, scannedBy: string, kind: KioskKind, timezone: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("attendance_logs").upsert(
    {
      campus_id: campusId,
      student_id: studentId,
      log_date: todayInTimezone(timezone),
      scanned_by: scannedBy,
      entry_method: kind,
    },
    { onConflict: "student_id,log_date", ignoreDuplicates: true },
  );
  return error;
}

/** The value as it is stored and compared: a dashed student number, or a normalised phone number. */
function cleanValue(kind: KioskKind, raw: string): string | null {
  if (kind === "student_number") return parseStudentNumber(raw);
  const phone = normalizePhone(raw);
  return phone.length >= 7 && phone.length <= 15 ? phone : null;
}

/** A student typed their student number or phone number at the kiosk. */
export async function kioskCheckInAction(kind: KioskKind, raw: string): Promise<ActionResult<KioskOutcome>> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;

  const value = cleanValue(kind, raw.slice(0, 40));
  if (!value) {
    return {
      ok: false,
      error: kind === "student_number" ? "Type your full student number, like 2017-05-07107." : "Type your full phone number.",
    };
  }
  // Someone guessing numbers at the kiosk would show up here as a flood of tries.
  const rate = await checkRateLimits([{ key: rateKey("kiosk:user", actor.id), limit: 300, windowSeconds: 300 }]);
  if (!rate.ok) return { ok: false, error: tooManyMessage(rate.retryAfter) };

  const admin = createAdminClient();
  const { data: student } = await admin
    .from("profiles")
    .select("id, first_name, last_name, is_active, details_complete")
    .eq("campus_id", actor.campus_id)
    .eq("role", "student")
    .eq(kind === "student_number" ? "student_number" : "phone", value)
    .maybeSingle<{ id: string; first_name: string; last_name: string; is_active: boolean; details_complete: boolean }>();

  // An invitation that was never finished has no real name yet, so it counts as having no account.
  if (!student || !student.details_complete) return { ok: true, data: { status: "no_account", kind, value } };
  if (!student.is_active) return { ok: false, error: "This account is turned off. Please see the Campus Head." };

  const campus = await getCampus(actor.campus_id);
  const error = await recordAttendance(actor.campus_id, student.id, actor.id, kind, campus?.timezone ?? "Asia/Manila");
  if (error) return { ok: false, error: "Your attendance could not be saved. Please try again." };

  return { ok: true, data: { status: "welcome", name: `${student.first_name} ${student.last_name}` } };
}

/** A student with no account yet filled in the form: create the account and mark them present. */
export async function kioskRegisterAction(
  kind: KioskKind,
  value: string,
  _prev: ActionResult<KioskOutcome> | null,
  formData: FormData,
): Promise<ActionResult<KioskOutcome>> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;

  // What they typed at the start is final: whatever the form says, the number they checked in with is the one saved.
  const known = cleanValue(kind, value);
  if (!known) return { ok: false, error: "Start again and type your number." };
  formData.set(kind === "student_number" ? "student_number" : "phone", known);

  const campus = await getCampus(actor.campus_id);
  const supabase = await createClient();
  const programs = await getActivePrograms(supabase, actor.campus_id);
  const parsed = parseAccountForm("student", formData, todayInTimezone(campus?.timezone), {
    courseMode: usesProgramList(programs) ? "program" : "text",
  });
  if (!parsed.ok) return parsed;
  if (parsed.value.programId && !programs.some((p) => p.id === parsed.value.programId)) {
    return { ok: false, error: "That program isn't available for this campus." };
  }

  const created = await createAccount({
    role: "student",
    campusId: actor.campus_id,
    fields: parsed.value,
    createdBy: actor.id,
  });
  if (!created.ok) return created;

  const error = await recordAttendance(actor.campus_id, created.profileId, actor.id, kind, campus?.timezone ?? "Asia/Manila");
  if (error) {
    return { ok: false, error: "Your account was created, but your attendance could not be saved. Please check in again." };
  }
  return { ok: true, data: { status: "welcome", name: `${parsed.value.firstName} ${parsed.value.lastName}` } };
}
