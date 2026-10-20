import type { Metadata } from "next";
import { PageHeader, StatCard } from "@/components/page-header";
import { DailyReportForm, type ReportNumbers } from "@/components/reports/daily-report-form";
import { GoogleFormPanel, type SendableForm } from "@/components/reports/google-form-panel";
import { ManageFormsDialog, type SavedForm } from "@/components/reports/manage-forms-dialog";
import { SendReportPanel } from "@/components/reports/send-report-panel";
import { FIELD_LABEL } from "@/lib/google-form";
import { Field, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCampus, requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Daily report" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SavedReport extends ReportNumbers {
  location: string | null;
  notes: string | null;
  is_locked: boolean;
}

interface Summary extends ReportNumbers {
  days_with_report: number;
}

interface Submission {
  id: string;
  report_title: string;
  submission_type: "google_docs" | "google_form";
  status: "pending" | "submitted" | "failed";
  date_from: string;
  date_to: string;
  total_attendees: number;
  target_google_doc_url: string | null;
  submitted_at: string;
  payload: { error?: string; form_name?: string } | null;
}

const ZERO: ReportNumbers = {
  total_attendance: 0,
  students_engaged: 0,
  students_heard_gospel: 0,
  students_accepted_jesus: 0,
  students_wants_dgroup: 0,
  volunteers_count: 0,
};

function one<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) ?? null) as T | null;
}

export default async function ReportsPage({ searchParams }: PageProps<"/campus-head/reports">) {
  const profile = await requireRole("campus_head");
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";
  const today = todayInTimezone(timezone);

  const params = await searchParams;
  const pick = (key: string, fallback: string) => {
    const v = params[key];
    return typeof v === "string" && DATE.test(v) ? v : fallback;
  };
  const date = pick("date", today);
  const from = pick("from", date);
  const to = pick("to", date);

  const supabase = await createClient();
  const [calc, savedRes, summaryRes, submissionsRes, lastDoc, formsRes, sentRes, lastFormRes] = await Promise.all([
    supabase.rpc("compute_daily_report", { p_campus_id: profile.campus_id, p_date: date }),
    supabase.from("daily_reports").select("*").eq("campus_id", profile.campus_id).eq("report_date", date).maybeSingle<SavedReport>(),
    from <= to
      ? supabase.rpc("range_report_summary", { p_campus_id: profile.campus_id, p_from: from, p_to: to })
      : Promise.resolve({ data: null }),
    supabase
      .from("report_submissions")
      .select("id, report_title, submission_type, status, date_from, date_to, total_attendees, target_google_doc_url, submitted_at, payload")
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("report_submissions")
      .select("target_google_doc_url")
      .eq("submission_type", "google_docs")
      .not("target_google_doc_url", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ target_google_doc_url: string }>(),
    supabase.from("campus_google_forms").select("id, name, url").order("created_at"),
    // Which forms this day has already been sent to (newest first, so the first match per form is the latest).
    supabase
      .from("report_submissions")
      .select("target_google_form_url, submitted_at")
      .eq("submission_type", "google_form")
      .eq("status", "submitted")
      .eq("date_from", date)
      .eq("date_to", date)
      .order("submitted_at", { ascending: false }),
    // The form last sent to successfully, so it is already selected. (A failed try doesn't count: the default would
    // change under the person's feet right after an error.)
    supabase
      .from("report_submissions")
      .select("target_google_form_url")
      .eq("submission_type", "google_form")
      .eq("status", "submitted")
      .not("target_google_form_url", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ target_google_form_url: string }>(),
  ]);

  const calculated = one<ReportNumbers>(calc.data) ?? ZERO;
  const saved = savedRes.data;
  const summary = one<Summary>(summaryRes.data);
  const submissions = (submissionsRes.data ?? []) as Submission[];
  const defaultDocUrl =
    lastDoc.data?.target_google_doc_url ??
    (campus?.target_google_doc_id ? `https://docs.google.com/document/d/${campus.target_google_doc_id}/edit` : "");

  const sentAtByUrl = new Map<string, string>();
  for (const row of (sentRes.data ?? []) as { target_google_form_url: string | null; submitted_at: string }[]) {
    if (row.target_google_form_url && !sentAtByUrl.has(row.target_google_form_url)) {
      sentAtByUrl.set(row.target_google_form_url, row.submitted_at);
    }
  }
  const forms: SendableForm[] = ((formsRes.data ?? []) as SavedForm[]).map((f) => {
    const sent = sentAtByUrl.get(f.url);
    return { ...f, sentAt: sent ? formatDateTime(sent, timezone) : null };
  });
  const defaultFormId = forms.find((f) => f.url === lastFormRes.data?.target_google_form_url)?.id ?? forms[0]?.id ?? null;

  const location = saved?.location?.trim() || campus?.report_location?.trim() || campus?.name || "";
  const formAnswers = saved
    ? [
        { label: FIELD_LABEL.date, value: formatDate(date) },
        { label: FIELD_LABEL.location, value: location },
        { label: FIELD_LABEL.attendees, value: saved.total_attendance },
        { label: FIELD_LABEL.heard, value: saved.students_heard_gospel },
        { label: FIELD_LABEL.accepted, value: saved.students_accepted_jesus },
        { label: FIELD_LABEL.dgroup, value: saved.students_wants_dgroup },
        { label: FIELD_LABEL.volunteers, value: saved.volunteers_count },
      ]
    : [];

  const rangeDays = from <= to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;

  return (
    <>
      <PageHeader title="Daily report" description="Check the numbers, adjust if needed, save the day, then send it to the Google Form." />

      <section className="mb-10" aria-labelledby="daily-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="daily-heading" className="text-lg font-semibold">
            {formatDate(date)}
            {saved ? (
              <Badge className="ml-2 align-middle" variant="secondary">
                {saved.is_locked ? "Locked" : "Saved"}
              </Badge>
            ) : (
              <Badge className="ml-2 align-middle" variant="outline">
                Not saved yet
              </Badge>
            )}
          </h2>
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <Field label="Report date" name="date" type="date" defaultValue={date} max={today} required />
            <SubmitButton variant="secondary">Show</SubmitButton>
          </form>
        </div>

        {/* key forces the form to reset when the date or saved state changes */}
        <DailyReportForm
          key={`${date}-${saved?.is_locked}-${saved ? "saved" : "new"}`}
          date={date}
          calculated={calculated}
          saved={saved}
          location={location}
          notes={saved?.notes ?? null}
          locked={saved?.is_locked ?? false}
        />
      </section>

      <section className="mb-10" aria-labelledby="form-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="form-heading" className="mb-1 text-lg font-semibold">
              Send to a Google Form
            </h2>
            <p className="text-sm text-muted-foreground">
              Submits {formatDate(date)} to the form you pick, using the saved numbers above.
            </p>
          </div>
          {/* Not inside the keyed panel below: that remounts whenever the forms change, which would close this dialog. */}
          <ManageFormsDialog
            forms={forms}
            triggerLabel={forms.length === 0 ? "Add a Google Form" : "Manage forms"}
            triggerVariant={forms.length === 0 ? "default" : "outline"}
          />
        </div>
        <GoogleFormPanel
          // Remounts when the saved forms or their send times change, so the choice and "send again" start fresh.
          key={`${date}-${saved ? "saved" : "new"}-${defaultFormId}-${forms.map((f) => `${f.id}:${f.sentAt ?? ""}`).join("|")}`}
          date={date}
          answers={formAnswers}
          forms={forms}
          defaultFormId={defaultFormId}
          hasReport={Boolean(saved)}
        />
      </section>

      <section className="mb-10" aria-labelledby="send-heading">
        <h2 id="send-heading" className="mb-1 text-lg font-semibold">
          Send to a Google Doc
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick the days to include. The totals are the sum of your saved daily reports.
        </p>

        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="date" value={date} />
          <Field label="From" name="from" type="date" defaultValue={from} max={today} required />
          <Field label="To" name="to" type="date" defaultValue={to} max={today} required />
          <SubmitButton variant="secondary">Preview totals</SubmitButton>
        </form>

        {from > to ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            The start date must be on or before the end date.
          </p>
        ) : summary && summary.days_with_report > 0 ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Attendance" value={summary.total_attendance} />
              <StatCard label="Engaged" value={summary.students_engaged} />
              <StatCard label="Heard Gospel" value={summary.students_heard_gospel} />
              <StatCard label="Accepted Jesus" value={summary.students_accepted_jesus} />
              <StatCard label="D-Group" value={summary.students_wants_dgroup} />
              <StatCard label="Volunteers" value={summary.volunteers_count} hint="Different people in range" />
            </div>
            {summary.days_with_report < rangeDays ? (
              <p className="mb-4 text-sm text-muted-foreground">
                {summary.days_with_report} of {rangeDays} days in this range have a saved report. Days without one are
                left out.
              </p>
            ) : null}
            <SendReportPanel key={`${from}-${to}`} from={from} to={to} defaultDocUrl={defaultDocUrl} />
          </>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No saved daily reports in this range yet. Save the daily report above, then preview again.
          </p>
        )}
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          Sent reports
        </h2>
        {submissions.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Reports you send to the Google Form or a Google Doc show up here with their status.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report</TableHead>
                  <TableHead>Sent to</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.report_title}</TableCell>
                    <TableCell>
                      {s.submission_type === "google_docs" ? "Google Doc" : "Google Form"}
                      {s.submission_type === "google_form" && s.payload?.form_name ? (
                        <p className="max-w-48 truncate text-xs text-muted-foreground">{s.payload.form_name}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{s.total_attendees}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "submitted" ? "secondary" : s.status === "failed" ? "destructive" : "outline"}>
                        {s.status === "submitted" ? "Sent" : s.status === "failed" ? "Failed" : "Pending"}
                      </Badge>
                      {s.status === "failed" && s.payload?.error ? (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{s.payload.error}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.submitted_at, timezone)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
