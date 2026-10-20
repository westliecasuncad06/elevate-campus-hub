"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { FormMessage, FormSelect, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import type { SavedForm } from "@/components/reports/manage-forms-dialog";
import { submitFormReportAction } from "@/app/actions/reports";
import { cn } from "@/lib/utils";

export interface FormAnswer {
  label: string;
  value: string | number;
}

export interface SendableForm extends SavedForm {
  /** When this day was last sent to this form, already formatted, or null if it never was. */
  sentAt: string | null;
}

/** Pick one of the saved Google Forms, see the seven answers it will get for one day, and submit them. */
export function GoogleFormPanel({
  date,
  answers,
  forms,
  defaultFormId,
  hasReport,
}: {
  date: string;
  answers: FormAnswer[];
  forms: SendableForm[];
  /** The form used last time, so the usual choice is already selected. */
  defaultFormId: string | null;
  /** False until the day's report has been saved; there is nothing to send before that. */
  hasReport: boolean;
}) {
  const { state, pending, formProps } = useFormAction(submitFormReportAction);
  // The starting choice never changes while this is mounted (the page re-keys the panel when the forms change), so
  // the select can stay uncontrolled; `selectedId` just mirrors it for the "already sent" notice.
  const initialId = defaultFormId ?? forms[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialId);
  const [again, setAgain] = useState(false);

  const selected = forms.find((f) => f.id === selectedId) ?? forms[0] ?? null;
  const sentAt = selected?.sentAt ?? null;

  useEffect(() => {
    // The page keys this panel on the saved forms and their last send times, so it remounts (with "send again"
    // cleared) after a success.
    if (state?.ok) toast.success(state.message ?? "Sent.");
  }, [state]);

  if (forms.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No Google Form saved yet. Use “Add a Google Form” above, then come back here to send this report.
      </p>
    );
  }

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4">
      {forms.length > 0 ? (
        <form {...formProps} className="grid gap-4">
          <input type="hidden" name="report_date" value={date} />

          <FormSelect
            label="Send to"
            name="form_id"
            defaultValue={initialId}
            options={forms.map((f) => ({ value: f.id, label: f.name }))}
            onValueChange={(id) => {
              setSelectedId(id);
              setAgain(false);
            }}
            className="sm:max-w-sm"
          />

          {hasReport ? (
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {answers.map((a) => (
                <div key={a.label} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1.5">
                  <dt className="text-muted-foreground">{a.label}</dt>
                  <dd className={cn("font-medium", typeof a.value === "number" && "tabular-nums")}>{a.value === "" ? "—" : a.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Save the daily report for this day first. Then you can send it to the form.
            </p>
          )}

          {hasReport && sentAt ? (
            <div className="grid gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2Icon className="size-4 text-primary" />
                Already sent to this form on {sentAt}
              </p>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name="again"
                  checked={again}
                  onChange={(e) => setAgain(e.target.checked)}
                  className="size-5 accent-[var(--primary)]"
                />
                <span>Send again (adds another row to the form’s sheet)</span>
              </label>
            </div>
          ) : null}

          <FormMessage state={state?.ok ? null : state} />

          <div>
            <SubmitButton pending={pending} pendingText="Sending…" disabled={!hasReport || (Boolean(sentAt) && !again)}>
              <SendIcon />
              {sentAt ? "Send again" : "Send to Google Form"}
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
