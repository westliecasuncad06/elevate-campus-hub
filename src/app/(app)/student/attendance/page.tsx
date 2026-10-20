import type { Metadata } from "next";
import { EmptyState, PageHeader, StatCard } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCampus, requireRole } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Attendance" };

interface Row {
  id: string;
  log_date: string;
  time_in: string;
  time_out: string | null;
}

export default async function StudentAttendancePage() {
  const profile = await requireRole("student");
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_logs")
    .select("id, log_date, time_in, time_out")
    .eq("student_id", profile.id)
    .order("log_date", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader title="Attendance" description="Every day you've checked in." />

      {rows.length === 0 ? (
        <EmptyState title="No visits yet" hint="Your check-ins will show up here after a facilitator scans your card." />
      ) : (
        <>
          <div className="mb-6 grid max-w-xs grid-cols-1">
            <StatCard label="Total visits" value={rows.length} hint={`Since ${formatDate(rows[rows.length - 1].log_date)}`} />
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{formatDate(r.log_date)}</TableCell>
                    <TableCell className="tabular-nums">{formatTime(r.time_in, timezone)}</TableCell>
                    <TableCell className="tabular-nums">{formatTime(r.time_out, timezone)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
