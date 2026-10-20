"use server";

import { revalidatePath } from "next/cache";
import { getActor, getCampus } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, todayInTimezone } from "@/lib/dates";
import { extractGoogleDocId, sendToAppsScript, type DocsReportPayload } from "@/lib/google";
import { submitToGoogleForm, type FormValues } from "@/lib/google-form";
import { fullName, type ActionResult } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "Only the Campus Head can do that." };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Totals {
  total_attendance: number;
  students_engaged: number;
  students_heard_gospel: number;
  students_accepted_jesus: number;
  students_wants_dgroup: number;
  volunteers_count: number;
}

function count(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

/** Save the Campus Head's reviewed numbers for one day (creates or updates the report). */
export async function saveDailyReportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;

  const campus = await getCampus(actor.campus_id);
  const date = String(formData.get("report_date") ?? "");
  if (!DATE.test(date)) return { ok: false, error: "Pick a valid date." };
  if (date > todayInTimezone(campus?.timezone)) return { ok: false, error: "You can't report on a future date." };

  const values = {
    total_attendance: count(formData, "total_attendance"),
    students_engaged: count(formData, "students_engaged"),
    students_heard_gospel: count(formData, "students_heard_gospel"),
    students_accepted_jesus: count(formData, "students_accepted_jesus"),
    students_wants_dgroup: count(formData, "students_wants_dgroup"),
    volunteers_count: count(formData, "volunteers_count"),
  };
  if (Object.values(values).some((v) => v === null)) {
    return { ok: false, error: "Each number must be a whole number, 0 or higher." };
  }
  if (values.students_engaged! > values.total_attendance!) {
    return { ok: false, error: "Engaged students can't be more than total attendance." };
  }

  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const location = String(formData.get("location") ?? "").trim().slice(0, 120) || null;

  const supabase = await createClient();
  const { error } = await supabase.from("daily_reports").upsert(
    { campus_id: actor.campus_id, report_date: date, ...values, location, notes, submitted_by: actor.id },
    { onConflict: "campus_id,report_date" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campus-head/reports");
  return { ok: true, message: "Daily report saved." };
}

/** Lock a day's report (creating it from live numbers if it was never saved) or unlock it again. */
export async function setReportLockAction(date: string, locked: boolean): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;
  if (!DATE.test(date)) return { ok: false, error: "Pick a valid date." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("campus_id", actor.campus_id)
    .eq("report_date", date)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await supabase.from("daily_reports").update({ is_locked: locked }).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    if (!locked) return { ok: true };
    const { data } = await supabase.rpc("compute_daily_report", { p_campus_id: actor.campus_id, p_date: date });
    const totals = (Array.isArray(data) ? data[0] : data) as Totals | null;
    const { error } = await supabase.from("daily_reports").insert({
      campus_id: actor.campus_id,
      report_date: date,
      total_attendance: totals?.total_attendance ?? 0,
      students_engaged: totals?.students_engaged ?? 0,
      students_heard_gospel: totals?.students_heard_gospel ?? 0,
      students_accepted_jesus: totals?.students_accepted_jesus ?? 0,
      students_wants_dgroup: totals?.students_wants_dgroup ?? 0,
      volunteers_count: totals?.volunteers_count ?? 0,
      submitted_by: actor.id,
      is_locked: true,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/campus-head/reports");
  return { ok: true, message: locked ? "Report locked." : "Report unlocked." };
}

/** Send the report for a date range to a Google Doc (through the Apps Script web app). */
export async function submitReportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;
  const campus = await getCampus(actor.campus_id);
  if (!campus) return { ok: false, error: "Your campus couldn't be found." };

  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!DATE.test(from) || !DATE.test(to) || from > to) return { ok: false, error: "Choose a valid date range." };
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return { ok: false, error: "Keep the range under a year." };

  const docUrl = String(formData.get("doc_url") ?? "").trim();
  const docId = extractGoogleDocId(docUrl) ?? campus.target_google_doc_id;
  if (!docId) return { ok: false, error: "Paste the link to the Google Doc that should receive the report." };

  const webhookUrl = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes("<deployment-id>")) {
    return {
      ok: false,
      error: "The Google Apps Script link isn't set up yet. Ask IT to add GOOGLE_APPS_SCRIPT_WEBHOOK_URL.",
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("range_report_summary", { p_campus_id: campus.id, p_from: from, p_to: to });
  const summary = (Array.isArray(data) ? data[0] : data) as (Totals & { days_with_report: number }) | null;
  if (!summary || summary.days_with_report === 0) {
    return { ok: false, error: "No saved daily reports in that range. Save the daily report first, then send it." };
  }

  const payload: DocsReportPayload = {
    type: "docs",
    docId,
    campusName: campus.name,
    location: campus.report_location ?? campus.name,
    dateFrom: from,
    dateTo: to,
    totalAttendance: summary.total_attendance,
    studentsEngaged: summary.students_engaged,
    studentsHeardGospel: summary.students_heard_gospel,
    studentsAcceptedJesus: summary.students_accepted_jesus,
    studentsWantsDgroup: summary.students_wants_dgroup,
    volunteersCount: summary.volunteers_count,
    submittedBy: fullName(actor),
  };

  const { data: row, error: insertError } = await supabase
    .from("report_submissions")
    .insert({
      campus_id: campus.id,
      report_title: `${campus.code} report ${from}${from === to ? "" : ` to ${to}`}`,
      date_from: from,
      date_to: to,
      total_attendees: summary.total_attendance,
      target_google_doc_url: docUrl || `https://docs.google.com/document/d/${docId}/edit`,
      submission_type: "google_docs",
      status: "pending",
      payload,
      submitted_by: actor.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) return { ok: false, error: insertError?.message ?? "Could not record the submission." };

  const result = await sendToAppsScript(webhookUrl, payload);

  const admin = createAdminClient();
  if (result.ok) {
    await supabase.from("report_submissions").update({ status: "submitted" }).eq("id", row.id);
    await admin.from("system_logs").insert({
      event: "report_submitted",
      detail: { campus: campus.code, kind: "google_docs", from, to, by: actor.id },
    });
  } else {
    await supabase
      .from("report_submissions")
      .update({ status: "failed", payload: { ...payload, error: result.error } })
      .eq("id", row.id);
    await admin.from("system_logs").insert({
      event: "report_failed",
      level: "error",
      detail: { campus: campus.code, kind: "google_docs", from, to, error: result.error },
    });
  }

  revalidatePath("/campus-head/reports");
  return result.ok
    ? { ok: true, message: "Report added to your Google Doc." }
    : { ok: false, error: `Couldn't send the report: ${result.error}` };
}

interface SavedDay extends Totals {
  location: string | null;
}

/** The School/Location a report goes out under: the day's own value, else the campus default. */
function reportLocation(day: { location: string | null } | null, campus: { name: string; report_location: string | null }) {
  return day?.location?.trim() || campus.report_location?.trim() || campus.name;
}

/**
 * Submit one saved day to the campus's Google Form, answering the same seven questions the form asks.
 * A day that was already sent needs an explicit "send again" so the sheet doesn't get a duplicate row by accident.
 */
export async function submitFormReportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;
  const campus = await getCampus(actor.campus_id);
  if (!campus) return { ok: false, error: "Your campus couldn't be found." };
  if (!campus.google_form_url) {
    return { ok: false, error: "This campus has no Google Form link yet. Ask the Super Admin to add it under Campuses." };
  }

  const date = String(formData.get("report_date") ?? "");
  if (!DATE.test(date)) return { ok: false, error: "Pick a valid date." };

  const supabase = await createClient();
  const { data: day } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("campus_id", campus.id)
    .eq("report_date", date)
    .maybeSingle<SavedDay>();
  if (!day) return { ok: false, error: "Save the daily report for that day first, then send it to the form." };

  const { data: previous } = await supabase
    .from("report_submissions")
    .select("submitted_at")
    .eq("campus_id", campus.id)
    .eq("submission_type", "google_form")
    .eq("status", "submitted")
    .eq("date_from", date)
    .eq("date_to", date)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ submitted_at: string }>();
  if (previous && formData.get("again") !== "on") {
    return {
      ok: false,
      error: `This day was already sent on ${formatDateTime(previous.submitted_at, campus.timezone)}. Tick “Send again” if you want a second entry.`,
    };
  }

  const values: FormValues = {
    date,
    location: reportLocation(day, campus),
    attendees: day.total_attendance,
    heard: day.students_heard_gospel,
    accepted: day.students_accepted_jesus,
    dgroup: day.students_wants_dgroup,
    volunteers: day.volunteers_count,
  };

  const { data: row, error: insertError } = await supabase
    .from("report_submissions")
    .insert({
      campus_id: campus.id,
      report_title: `${campus.code} report ${date}`,
      date_from: date,
      date_to: date,
      total_attendees: day.total_attendance,
      target_google_form_url: campus.google_form_url,
      submission_type: "google_form",
      status: "pending",
      payload: values,
      submitted_by: actor.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) return { ok: false, error: insertError?.message ?? "Could not record the submission." };

  const result = await submitToGoogleForm(campus.google_form_url, values);

  const admin = createAdminClient();
  if (result.ok) {
    await supabase.from("report_submissions").update({ status: "submitted" }).eq("id", row.id);
    await admin.from("system_logs").insert({
      event: "report_submitted",
      detail: { campus: campus.code, kind: "google_form", from: date, to: date, by: actor.id },
    });
  } else {
    await supabase
      .from("report_submissions")
      .update({ status: "failed", payload: { ...values, error: result.error } })
      .eq("id", row.id);
    await admin.from("system_logs").insert({
      event: "report_failed",
      level: "error",
      detail: { campus: campus.code, kind: "google_form", from: date, to: date, error: result.error },
    });
  }

  revalidatePath("/campus-head/reports");
  return result.ok
    ? { ok: true, message: "Sent to the Google Form." }
    : { ok: false, error: `Couldn't send it: ${result.error}` };
}
