"use server";

import { revalidatePath } from "next/cache";
import { getActor, getCampus } from "@/lib/auth";
import { createAccount } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import { courseLabel, usesProgramList } from "@/lib/course";
import { todayInTimezone } from "@/lib/dates";
import { looksLikeEmail, normalizePhone } from "@/lib/phone";
import { searchTerm } from "@/lib/postgrest";
import { getActivePrograms } from "@/lib/queries";
import { checkRateLimits, rateKey, tooManyMessage } from "@/lib/rate-limit";
import { parseAccountForm } from "@/lib/validation";
import type { ActionResult, EntryMethod, Profile } from "@/lib/types";

/** Attendance is now recorded by adding a student to one of your open batches. */
export interface AttendanceOutcome {
  action: "added" | "already_in_batch";
  batchNumber: number;
  student: { id: string; first_name: string; last_name: string; phone: string | null; email: string };
  timeIn: string;
  timezone: string;
  assignedNow: boolean;
  facilitatorIsMe: boolean;
  hasFacilitator: boolean;
  genderMismatch: boolean;
  firstTimer?: boolean;
}

export interface StudentHit {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  program: string | null;
  status: "not_in" | "checked_in" | "in_this_batch";
}

const FORBIDDEN: ActionResult<never> = { ok: false, error: "Only a Campus Head or Facilitator can add students to a batch." };
const QR_TOKEN = /^[0-9a-fA-F-]{36}$/;

/** Calls add_student_to_batch and shapes its answer for the UI. */
async function addToBatch(
  actor: Profile,
  batchId: string,
  studentId: string,
  method: EntryMethod,
): Promise<ActionResult<AttendanceOutcome>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_student_to_batch", {
    p_batch_id: batchId,
    p_student_id: studentId,
    p_method: method,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add the student." };

  const campus = await getCampus(actor.campus_id);
  const result = data as {
    action: AttendanceOutcome["action"];
    batch_number: number;
    assigned_now: boolean;
    facilitator_id: string | null;
    gender_mismatch: boolean;
    log: { time_in: string };
    student: AttendanceOutcome["student"];
  };

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      action: result.action,
      batchNumber: result.batch_number,
      student: result.student,
      timeIn: result.log.time_in,
      timezone: campus?.timezone ?? "Asia/Manila",
      assignedNow: result.assigned_now,
      facilitatorIsMe: result.facilitator_id === actor.id,
      hasFacilitator: result.facilitator_id !== null,
      genderMismatch: result.gender_mismatch,
    },
  };
}

/** A QR scan: the QR code contains the student's qr_token. */
export async function addToBatchByQrAction(batchId: string, token: string): Promise<ActionResult<AttendanceOutcome>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return FORBIDDEN;

  const value = token.trim();
  if (!QR_TOKEN.test(value)) return { ok: false, error: "That isn't an Elevate Campus Hub QR code." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("profiles")
    .select("id")
    .eq("qr_token", value)
    .eq("role", "student")
    .eq("is_active", true)
    // A student invited by email who hasn't registered yet has no name or details to record against.
    .eq("details_complete", true)
    .maybeSingle<{ id: string }>();
  if (!student) return { ok: false, error: "No student at your campus has this QR code." };

  return addToBatch(actor, batchId, student.id, "qr");
}

/** Adds a student picked from the phone/email lookup. */
export async function addToBatchByIdAction(
  batchId: string,
  studentId: string,
  method: EntryMethod,
): Promise<ActionResult<AttendanceOutcome>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return FORBIDDEN;
  return addToBatch(actor, batchId, studentId, method);
}

/** Fallback lookup by phone number or email (and, as a convenience, by name). */
export async function lookupStudentsAction(
  batchId: string,
  rawQuery: string,
): Promise<ActionResult<{ hits: StudentHit[]; method: EntryMethod }>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return FORBIDDEN;

  const query = rawQuery.trim().slice(0, 100);
  if (query.length < 3) return { ok: false, error: "Type a phone number or email address." };
  // Someone scripting guesses at student emails and phone numbers would show up here as a flood of lookups.
  const rate = await checkRateLimits([{ key: rateKey("lookup:user", actor.id), limit: 150, windowSeconds: 300 }]);
  if (!rate.ok) return { ok: false, error: tooManyMessage(rate.retryAfter) };

  const supabase = await createClient();
  let builder = supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, email, course, program:programs(code)")
    .eq("role", "student")
    .eq("is_active", true)
    .eq("details_complete", true)
    .limit(5);

  let method: EntryMethod = "manual";
  if (looksLikeEmail(query)) {
    method = "email";
    // ilike without wildcards = case-insensitive exact match; escape the characters that act as wildcards.
    builder = builder.ilike("email", query.replace(/[\\%_]/g, (c) => `\\${c}`));
  } else if (/^[\d\s+()-]+$/.test(query)) {
    method = "phone";
    builder = builder.eq("phone", normalizePhone(query));
  } else {
    const safe = searchTerm(query);
    if (safe.length < 2) return { ok: false, error: "Type at least 2 letters of the name." };
    builder = builder.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`);
  }

  const { data, error } = await builder;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string;
    course: string | null;
    program: { code: string } | null;
  }>;

  // Who is already in THIS batch, and who has checked in today (in any batch).
  const ids = rows.map((r) => r.id);
  const { data: batch } = await supabase
    .from("engagement_batches")
    .select("batch_date")
    .eq("id", batchId)
    .maybeSingle<{ batch_date: string }>();
  const date = batch?.batch_date ?? todayInTimezone((await getCampus(actor.campus_id))?.timezone);

  const [{ data: inBatch }, { data: checkedIn }] = ids.length
    ? await Promise.all([
        supabase.from("batch_students").select("student_id").eq("batch_id", batchId).in("student_id", ids),
        supabase.from("attendance_logs").select("student_id").eq("log_date", date).in("student_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const inThisBatch = new Set((inBatch ?? []).map((b) => b.student_id as string));
  const checkedInToday = new Set((checkedIn ?? []).map((a) => a.student_id as string));

  const hits: StudentHit[] = rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    phone: r.phone,
    email: r.email,
    program: courseLabel(r),
    status: inThisBatch.has(r.id) ? "in_this_batch" : checkedInToday.has(r.id) ? "checked_in" : "not_in",
  }));

  return { ok: true, data: { hits, method } };
}

/** First-timer flow: create the account (sends the invitation) and add them to the batch right away. */
export async function registerFirstTimerAction(
  batchId: string,
  _prev: ActionResult<AttendanceOutcome> | null,
  formData: FormData,
): Promise<ActionResult<AttendanceOutcome>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor?.campus_id) return FORBIDDEN;

  const campus = await getCampus(actor.campus_id);
  const supabase = await createClient();

  // A campus with its own programs gets a dropdown; any other campus has students type their course.
  const programs = await getActivePrograms(supabase, actor.campus_id);
  const parsed = parseAccountForm("student", formData, todayInTimezone(campus?.timezone), {
    courseMode: usesProgramList(programs) ? "program" : "text",
  });
  if (!parsed.ok) return parsed;
  if (parsed.value.programId && !programs.some((p) => p.id === parsed.value.programId)) {
    return { ok: false, error: "That program isn't available for this campus." };
  }

  // Check the batch up front so a closed batch doesn't leave a freshly invited student behind.
  const { data: batch } = await supabase
    .from("engagement_batches")
    .select("status, facilitator_id")
    .eq("id", batchId)
    .maybeSingle<{ status: string; facilitator_id: string }>();
  if (!batch || batch.facilitator_id !== actor.id || batch.status !== "open") {
    return { ok: false, error: "This batch isn't open any more. Start a new batch to add students." };
  }

  const created = await createAccount({
    role: "student",
    campusId: actor.campus_id,
    fields: parsed.value,
    createdBy: actor.id,
  });
  if (!created.ok) return created;

  const outcome = await addToBatch(actor, batchId, created.profileId, "manual");
  if (!outcome.ok) {
    return {
      ok: false,
      error: `${parsed.value.firstName} was registered and emailed, but couldn't be added to the batch (${outcome.error}). Use Look up to add them.`,
    };
  }
  return { ok: true, data: { ...outcome.data!, firstTimer: true } };
}
