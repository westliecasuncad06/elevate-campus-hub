import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { Field, SubmitButton, type Option } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCampus, requireRole } from "@/lib/auth";
import { loadAttendanceSheet } from "@/lib/attendance-sheet";
import { todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Attendance sheet" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
const PRESETS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last year", days: 365 },
];

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function AttendanceSheetPage({ searchParams }: PageProps<"/campus-head/attendance">) {
  const profile = await requireRole("campus_head");
  const campus = await getCampus(profile.campus_id);
  if (!campus) return null;
  const today = todayInTimezone(campus.timezone);

  const params = await searchParams;
  const pick = (key: string, fallback: string) => {
    const v = params[key];
    return typeof v === "string" && DATE.test(v) ? v : fallback;
  };
  let to = pick("to", today);
  if (to > today) to = today;
  let from = pick("from", shiftDays(to, -89));

  const swapped = from > to;
  if (swapped) from = to;
  const tooLong = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > MAX_DAYS;
  if (tooLong) from = shiftDays(to, -(MAX_DAYS - 1));

  const supabase = await createClient();
  const [{ sessions, rows }, { data: facilitatorRows }] = await Promise.all([
    loadAttendanceSheet(supabase, campus, from, to),
    supabase.from("profiles").select("id, first_name, last_name").in("role", ["facilitator", "campus_head"]).eq("is_active", true).order("first_name"),
  ]);

  const facilitators: Option[] = (facilitatorRows ?? []).map((p) => ({
    value: p.id as string,
    label: `${p.first_name} ${p.last_name}`.trim(),
  }));

  return (
    <>
      <PageHeader
        title="Attendance sheet"
        description="How consistently each student comes to the hub. Every column is a day the campus met."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Field label="From" name="from" type="date" defaultValue={from} max={to} required />
          <Field label="To" name="to" type="date" defaultValue={to} max={today} required />
          <SubmitButton variant="secondary">Show</SubmitButton>
        </form>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = to === today && from === shiftDays(today, -(p.days - 1));
            return (
              <Button
                key={p.days}
                size="sm"
                variant={active ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={`/campus-head/attendance?from=${shiftDays(today, -(p.days - 1))}&to=${today}`} />}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>

      {swapped ? (
        <p role="alert" className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The start date was after the end date, so it was set to the end date.
        </p>
      ) : null}
      {tooLong ? (
        <p role="status" className="mb-4 rounded-xl bg-secondary px-4 py-3 text-sm">
          Ranges are limited to a year, so the sheet starts on {from}.
        </p>
      ) : null}

      <AttendanceSheet
        key={`${from}-${to}`}
        sessions={sessions}
        rows={rows}
        facilitators={facilitators}
        campusCode={campus.code}
        from={from}
        to={to}
      />
    </>
  );
}
