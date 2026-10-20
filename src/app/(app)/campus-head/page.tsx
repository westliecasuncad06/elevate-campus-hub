import type { Metadata } from "next";
import { PageHeader, StatCard } from "@/components/page-header";
import { TodayWorkspace } from "@/components/batch/today-workspace";
import { getCampus, requireRole } from "@/lib/auth";
import { formatDate, todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Today" };

interface Totals {
  total_attendance: number;
  students_engaged: number;
  students_heard_gospel: number;
  students_accepted_jesus: number;
  students_wants_dgroup: number;
  volunteers_count: number;
}

export default async function CampusHeadHome({ searchParams }: PageProps<"/campus-head">) {
  const profile = await requireRole("campus_head");
  const campus = await getCampus(profile.campus_id);
  const today = todayInTimezone(campus?.timezone);
  const params = await searchParams;
  const batch = typeof params.batch === "string" ? params.batch : null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("compute_daily_report", { p_campus_id: profile.campus_id, p_date: today });
  const totals = (Array.isArray(data) ? data[0] : data) as Totals | null;

  return (
    <>
      <PageHeader title="Today" description={`${formatDate(today)} · numbers for the whole campus`} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Attended" value={totals?.total_attendance ?? 0} />
        <StatCard label="Engaged" value={totals?.students_engaged ?? 0} />
        <StatCard label="Heard the Gospel" value={totals?.students_heard_gospel ?? 0} />
        <StatCard label="Accepted Jesus" value={totals?.students_accepted_jesus ?? 0} />
        <StatCard label="Want a D-Group" value={totals?.students_wants_dgroup ?? 0} />
      </div>

      <TodayWorkspace profile={profile} basePath="/campus-head" requestedBatchId={batch} />
    </>
  );
}
