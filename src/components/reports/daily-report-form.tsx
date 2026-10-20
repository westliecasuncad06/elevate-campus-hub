"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormAction } from "@/components/use-form-action";
import { CopyIcon, LockIcon, LockOpenIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, SubmitButton } from "@/components/forms";
import { saveDailyReportAction, setReportLockAction } from "@/app/actions/reports";
import { copyText } from "@/lib/clipboard";
import { formatReportText } from "@/lib/report-text";

export interface ReportNumbers {
  total_attendance: number;
  students_engaged: number;
  students_heard_gospel: number;
  students_accepted_jesus: number;
  students_wants_dgroup: number;
  volunteers_count: number;
}

const FIELDS: { key: keyof ReportNumbers; label: string }[] = [
  { key: "total_attendance", label: "Total attendance" },
  { key: "students_engaged", label: "Students engaged" },
  { key: "students_heard_gospel", label: "Heard the Gospel" },
  { key: "students_accepted_jesus", label: "Accepted Jesus" },
  { key: "students_wants_dgroup", label: "Want a D-Group" },
  { key: "volunteers_count", label: "Volunteers" },
];

type Draft = Record<keyof ReportNumbers, string>;

function toDraft(numbers: ReportNumbers): Draft {
  // `numbers` can be a whole database row, so take only the six counts.
  return Object.fromEntries(FIELDS.map(({ key }) => [key, String(numbers[key])])) as Draft;
}

/** Review the day's numbers, adjust them if needed, save, and lock. */
export function DailyReportForm({
  date,
  calculated,
  saved,
  location,
  notes,
  locked,
}: {
  date: string;
  calculated: ReportNumbers;
  saved: ReportNumbers | null;
  /** Pre-filled School/Location: this day's saved value, else the campus default. */
  location: string;
  notes: string | null;
  locked: boolean;
}) {
  // Kept as text while typing, so a box can be emptied and retyped. Turning every keystroke into a number put the
  // "0" straight back whenever the box was cleared.
  const [values, setValues] = useState<Draft>(() => toDraft(saved ?? calculated));
  const { state, pending, formProps } = useFormAction(saveDailyReportAction);
  const [lockPending, startLock] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved.");
  }, [state]);

  /** Copies the numbers on screen as the ministry's plain-text report, ready to paste into a chat. */
  async function copyReport() {
    if (FIELDS.some(({ key }) => values[key] === "")) {
      toast.error("Fill in every number first.");
      return;
    }
    const counts = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key])])) as unknown as ReportNumbers;
    if (await copyText(formatReportText(date, counts))) toast.success("Report copied. Paste it where you need it.");
    else toast.error("Couldn't copy. Your browser blocked it.");
  }

  function toggleLock() {
    startLock(async () => {
      const result = await setReportLockAction(date, !locked);
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error);
    });
  }

  return (
    <form {...formProps} className="grid gap-5">
      <input type="hidden" name="report_date" value={date} />

      {locked ? (
        <p className="flex items-center gap-2 rounded-xl bg-brand/20 px-4 py-3 text-sm font-medium text-brand-ink">
          <LockIcon className="size-4" />
          This report is locked. Unlock it to make changes.
        </p>
      ) : null}

      <div className="grid gap-1.5 sm:max-w-md">
        <Label htmlFor="location">School/Location</Label>
        <Input id="location" name="location" defaultValue={location} disabled={locked} maxLength={120} />
        <p className="text-xs text-muted-foreground">Goes in the report’s School/Location answer.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {FIELDS.map(({ key, label }) => {
          const edited = values[key] !== "" && Number(values[key]) !== calculated[key];
          return (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                name={key}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{1,6}"
                title="A whole number, 0 or higher"
                required
                disabled={locked}
                value={values[key]}
                // Digits only; the box may be empty while the person types the new number.
                onChange={(e) => setValues({ ...values, [key]: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                // Selecting everything on focus means typing replaces the old number.
                onFocus={(e) => e.target.select()}
                // "007" -> "7" once they leave the box.
                onBlur={() => values[key] !== "" && setValues({ ...values, [key]: String(Number(values[key])) })}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                {edited ? `Edited. Counted from attendance: ${calculated[key]}` : "Counted from attendance"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={notes ?? ""} disabled={locked} maxLength={2000} />
      </div>

      <FormMessage state={state?.ok ? null : state} />

      <div className="flex flex-wrap gap-2">
        {!locked ? (
          <>
            <SubmitButton pending={pending} pendingText="Saving…">
              Save report
            </SubmitButton>
            <Button type="button" variant="outline" onClick={() => setValues(toDraft(calculated))}>
              <RotateCcwIcon />
              Reset to counted numbers
            </Button>
          </>
        ) : null}
        <Button type="button" variant={locked ? "secondary" : "outline"} disabled={lockPending} onClick={toggleLock}>
          {locked ? <LockOpenIcon /> : <LockIcon />}
          {locked ? "Unlock report" : "Lock report"}
        </Button>
        <Button type="button" variant="outline" onClick={copyReport}>
          <CopyIcon />
          Copy report
        </Button>
      </div>
    </form>
  );
}
