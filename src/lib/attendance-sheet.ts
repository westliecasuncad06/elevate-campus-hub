import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStudentStats, type SheetRow } from "@/lib/attendance-stats";
import { courseLabel } from "@/lib/course";
import { todayInTimezone } from "@/lib/dates";
import { fullName, type Gender } from "@/lib/types";

const PAGE = 1000; // PostgREST returns at most this many rows per request.

/** Reads every row of a query by walking it in pages. (Supabase can't infer joined shapes, so rows are cast to T.) */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return all;
  }
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender | null;
  course: string | null;
  year_level: number | null;
  created_at: string;
  program: { code: string } | null;
}

interface RosterEntry {
  id: string;
  full_name: string;
  gender: Gender | null;
  year_level: number | null;
  course: string | null;
  claimed_by: string | null;
}

interface RosterMark {
  roster_id: string;
  log_date: string;
  status: "present" | "absent";
}

export interface AttendanceSheetData {
  /** Days the campus met in the range, oldest first. */
  sessions: string[];
  rows: SheetRow[];
}

/**
 * One row per active student in the campus, plus one per roster name that has no account yet, with a cell for every day
 * the campus met between `from` and `to`. Attendance recorded on the roster (from the campus's own sheet) counts too,
 * so a name that registers later simply carries on from the history it already had.
 * Runs as the signed-in Campus Head, so row-level security keeps it to their own campus.
 */
export async function loadAttendanceSheet(
  supabase: SupabaseClient,
  campus: { id: string; timezone: string },
  from: string,
  to: string,
): Promise<AttendanceSheetData> {
  const [sessionRows, students, attendance, assignments, people, rosterEntries, rosterMarks] = await Promise.all([
    fetchAll<unknown>((a, b) =>
      supabase.rpc("attendance_session_dates", { p_campus_id: campus.id, p_from: from, p_to: to }).range(a, b),
    ),
    fetchAll<StudentRow>((a, b) =>
      supabase
        .from("profiles")
        .select("id, first_name, last_name, gender, course, year_level, created_at, program:programs(code)")
        .eq("role", "student")
        .eq("is_active", true)
        .order("id")
        .range(a, b),
    ),
    fetchAll<{ student_id: string; dates: string[] }>((a, b) =>
      supabase.rpc("attendance_dates_by_student", { p_campus_id: campus.id, p_from: from, p_to: to }).order("student_id").range(a, b),
    ),
    fetchAll<{ student_id: string; facilitator_id: string }>((a, b) =>
      supabase.from("facilitator_students").select("student_id, facilitator_id").eq("is_active", true).order("id").range(a, b),
    ),
    fetchAll<{ id: string; first_name: string; last_name: string }>((a, b) =>
      supabase.from("profiles").select("id, first_name, last_name").in("role", ["facilitator", "campus_head"]).order("id").range(a, b),
    ),
    fetchAll<RosterEntry>((a, b) =>
      supabase
        .from("roster_students")
        .select("id, full_name, gender, year_level, course, claimed_by")
        .eq("campus_id", campus.id)
        .order("id")
        .range(a, b),
    ),
    fetchAll<RosterMark>((a, b) =>
      supabase.from("roster_attendance").select("roster_id, log_date, status").eq("campus_id", campus.id).order("id").range(a, b),
    ),
  ]);

  // `setof date` comes back as bare strings; be tolerant of an object wrapper too.
  const loggedSessions = sessionRows
    .map((r) => (typeof r === "string" ? r : String(Object.values(r as Record<string, unknown>)[0] ?? "")))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  // What the campus's own sheet says about each roster name: the days present, and the first day it has any mark for
  // (they can't be marked absent for weeks before that).
  const rosterHistory = new Map<string, { present: Set<string>; first: string }>();
  for (const mark of rosterMarks) {
    const entry = rosterHistory.get(mark.roster_id) ?? { present: new Set<string>(), first: mark.log_date };
    if (mark.status === "present") entry.present.add(mark.log_date);
    if (mark.log_date < entry.first) entry.first = mark.log_date;
    rosterHistory.set(mark.roster_id, entry);
  }

  // A day counts as a session when anyone was recorded: a scan or a green cell on the campus's sheet.
  const sessionSet = new Set(loggedSessions);
  for (const { present } of rosterHistory.values()) for (const day of present) if (day >= from && day <= to) sessionSet.add(day);
  const sessions = [...sessionSet].sort();

  const today = todayInTimezone(campus.timezone);
  const datesByStudent = new Map(attendance.map((r) => [r.student_id, r.dates ?? []]));
  const facilitatorOf = new Map(assignments.map((a) => [a.student_id, a.facilitator_id]));
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const rosterOfStudent = new Map(rosterEntries.filter((r) => r.claimed_by).map((r) => [r.claimed_by as string, r.id]));

  const rows: SheetRow[] = students.map((s) => {
    const facilitatorId = facilitatorOf.get(s.id) ?? null;
    const facilitator = facilitatorId ? peopleById.get(facilitatorId) : undefined;
    let registeredOn = todayInTimezone(campus.timezone, new Date(s.created_at));
    const attended = [...(datesByStudent.get(s.id) ?? [])];

    // A student who came from the roster keeps the history the campus's sheet already had for them.
    const history = rosterHistory.get(rosterOfStudent.get(s.id) ?? "");
    if (history) {
      attended.push(...history.present);
      if (history.first < registeredOn) registeredOn = history.first;
    }

    return {
      id: s.id,
      name: fullName(s),
      gender: s.gender,
      course: courseLabel(s),
      yearLevel: s.year_level,
      facilitatorId,
      facilitator: facilitator ? fullName(facilitator) : null,
      ...computeStudentStats(sessions, registeredOn, attended, today),
    };
  });

  // Names on the roster that haven't registered yet.
  for (const entry of rosterEntries) {
    if (entry.claimed_by) continue;
    const history = rosterHistory.get(entry.id);
    rows.push({
      id: `roster:${entry.id}`,
      name: entry.full_name,
      gender: entry.gender,
      course: entry.course,
      yearLevel: entry.year_level,
      facilitatorId: null,
      facilitator: null,
      rosterOnly: true,
      ...computeStudentStats(sessions, history?.first ?? today, [...(history?.present ?? [])], today),
    });
  }

  return { sessions, rows };
}
