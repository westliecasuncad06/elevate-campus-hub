import type { SupabaseClient } from "@supabase/supabase-js";
import type { Batch, BatchStudent } from "@/lib/types";

type Engagement = { is_engaged: boolean; heard_gospel: boolean; accepted_jesus: boolean; wants_dgroup: boolean };

interface BatchRow {
  id: string;
  batch_number: number;
  batch_date: string;
  status: "open" | "finished";
  started_at: string;
  finished_at: string | null;
  facilitator_id: string;
  facilitator: { first_name: string; last_name: string } | null;
  students: {
    student_id: string;
    added_at: string;
    student: { first_name: string; last_name: string; phone: string | null } | null;
    attendance: { id: string; time_out: string | null; engagement: Engagement | Engagement[] | null } | null;
  }[];
}

const SELECT = `
  id, batch_number, batch_date, status, started_at, finished_at, facilitator_id,
  facilitator:profiles!facilitator_id(first_name, last_name),
  students:batch_students(
    student_id, added_at,
    student:profiles!student_id(first_name, last_name, phone),
    attendance:attendance_logs!attendance_log_id(id, time_out, engagement:engagement_logs(is_engaged, heard_gospel, accepted_jesus, wants_dgroup))
  )
`;

export interface BatchFilter {
  facilitatorId?: string;
  status?: "open" | "finished";
  /** Inclusive YYYY-MM-DD bounds on the batch's date. */
  from?: string;
  to?: string;
  limit?: number;
}

/** Batches with their students and engagement. Row Level Security decides what the viewer may see. */
export async function loadBatches(supabase: SupabaseClient, filter: BatchFilter = {}): Promise<Batch[]> {
  let query = supabase
    .from("engagement_batches")
    .select(SELECT)
    .order("batch_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(filter.limit ?? 100);

  if (filter.facilitatorId) query = query.eq("facilitator_id", filter.facilitatorId);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.from) query = query.gte("batch_date", filter.from);
  if (filter.to) query = query.lte("batch_date", filter.to);

  const { data } = await query;
  return ((data ?? []) as unknown as BatchRow[]).map(toBatch);
}

function toBatch(row: BatchRow): Batch {
  const students: BatchStudent[] = row.students
    .filter((s) => s.student && s.attendance)
    .map((s) => {
      const e = Array.isArray(s.attendance!.engagement) ? (s.attendance!.engagement[0] ?? null) : s.attendance!.engagement;
      return {
        logId: s.attendance!.id,
        studentId: s.student_id,
        firstName: s.student!.first_name,
        lastName: s.student!.last_name,
        phone: s.student!.phone,
        addedAt: s.added_at,
        timeOut: s.attendance!.time_out,
        engagement: e
          ? { isEngaged: e.is_engaged, heardGospel: e.heard_gospel, acceptedJesus: e.accepted_jesus, wantsDgroup: e.wants_dgroup }
          : null,
      };
    })
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt));

  return {
    id: row.id,
    number: row.batch_number,
    date: row.batch_date,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    facilitatorId: row.facilitator_id,
    facilitatorName: row.facilitator ? `${row.facilitator.first_name} ${row.facilitator.last_name}`.trim() : "Unknown",
    students,
  };
}

export function pendingCount(batch: Batch): number {
  return batch.students.filter((s) => !s.engagement).length;
}

/** "12 min", "1 h 5 min", "under a minute". */
export function formatDuration(fromIso: string | null, toIso: string | null): string | null {
  if (!fromIso || !toIso) return null;
  const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
