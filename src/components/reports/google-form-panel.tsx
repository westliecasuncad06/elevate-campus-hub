"use client";

import { useEffect, useState } from "react";
import { CheckCircle2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { submitFormReportAction } from "@/app/actions/reports";
import { cn } from "@/lib/utils";

export interface FormAnswer {
  label: string;
  value: string | number;
}

/** Shows the seven answers the Google Form will get for one day, and submits them. */
export function GoogleFormPanel({
  date,
  answers,
  sentAt,
}: {
  date: string;
  answers: FormAnswer[];
  /** When this day was last sent, already formatted, or null if it never was. */
  sentAt: string | null;
}) {
  const { state, pending, formProps } = useFormAction(submitFormReportAction);
  const [again, setAgain] = useState(false);

  useEffect(() => {
    // The page keys this panel on the last send time, so it remounts (with "send again" cleared) after a success.
    if (state?.ok) toast.success(state.message ?? "Sent.");
  }, [state]);

  return (
    <form {...formProps} className="grid gap-4 rounded-xl border bg-card p-4">
      <input type="hidden" name="report_date" value={date} />

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {answers.map((a) => (
          <div key={a.label} className="flex items-baseline justify-between gap-3 border-b border-dashed pb-1.5">
            <dt className="text-muted-foreground">{a.label}</dt>
            <dd className={cn("font-medium", typeof a.value === "number" && "tabular-nums")}>{a.value === "" ? "—" : a.value}</dd>
          </div>
        ))}
      </dl>

      {sentAt ? (
        <div className="grid gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2Icon className="size-4 text-primary" />
            Already sent on {sentAt}
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
        <SubmitButton pending={pending} pendingText="Sending…" disabled={Boolean(sentAt) && !again}>
          <SendIcon />
          {sentAt ? "Send again" : "Send to Google Form"}
        </SubmitButton>
      </div>
    </form>
  );
}
