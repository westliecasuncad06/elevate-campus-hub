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

export interface AttendanceSheetData {
  /** Days the campus met in the range, oldest first. */
  sessions: string[];
  rows: SheetRow[];
}

/**
 * One row per active student in the campus, with a cell for every day the campus met between `from` and `to`.
 * Runs as the signed-in Campus Head, so row-level security keeps it to their own campus.
 */
export async function loadAttendanceSheet(
  supabase: SupabaseClient,
  campus: { id: string; timezone: string },
  from: string,
  to: string,
): Promise<AttendanceSheetData> {
  const [sessionRows, students, attendance, assignments, people] = await Promise.all([
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
  ]);

  // `setof date` comes back as bare strings; be tolerant of an object wrapper too.
  const sessions = sessionRows
    .map((r) => (typeof r === "string" ? r : String(Object.values(r as Record<string, unknown>)[0] ?? "")))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  const today = todayInTimezone(campus.timezone);
  const datesByStudent = new Map(attendance.map((r) => [r.student_id, r.dates ?? []]));
  const facilitatorOf = new Map(assignments.map((a) => [a.student_id, a.facilitator_id]));
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const rows: SheetRow[] = students.map((s) => {
    const facilitatorId = facilitatorOf.get(s.id) ?? null;
    const facilitator = facilitatorId ? peopleById.get(facilitatorId) : undefined;
    const registeredOn = todayInTimezone(campus.timezone, new Date(s.created_at));
    return {
      id: s.id,
      name: fullName(s),
      gender: s.gender,
      course: courseLabel(s),
      yearLevel: s.year_level,
      facilitatorId,
      facilitator: facilitator ? fullName(facilitator) : null,
      ...computeStudentStats(sessions, registeredOn, datesByStudent.get(s.id) ?? [], today),
    };
  });

  return { sessions, rows };
}
