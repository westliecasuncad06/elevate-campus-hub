"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormAction } from "@/components/use-form-action";
import { LockIcon, LockOpenIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage, SubmitButton } from "@/components/forms";
import { saveDailyReportAction, setReportLockAction } from "@/app/actions/reports";

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

/** Review the day's numbers, adjust them if needed, save, and lock. */
export function DailyReportForm({
  date,
  calculated,
  saved,
  notes,
  locked,
}: {
  date: string;
  calculated: ReportNumbers;
  saved: ReportNumbers | null;
  notes: string | null;
  locked: boolean;
}) {
  const [values, setValues] = useState<ReportNumbers>(saved ?? calculated);
  const { state, pending, formProps } = useFormAction(saveDailyReportAction);
  const [lockPending, startLock] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved.");
  }, [state]);

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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {FIELDS.map(({ key, label }) => {
          const edited = values[key] !== calculated[key];
          return (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                name={key}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                required
                disabled={locked}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
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
            <Button type="button" variant="outline" onClick={() => setValues(calculated)}>
              <RotateCcwIcon />
              Reset to counted numbers
            </Button>
          </>
        ) : null}
        <Button type="button" variant={locked ? "secondary" : "outline"} disabled={lockPending} onClick={toggleLock}>
          {locked ? <LockOpenIcon /> : <LockIcon />}
          {locked ? "Unlock report" : "Lock report"}
        </Button>
      </div>
    </form>
  );
}
