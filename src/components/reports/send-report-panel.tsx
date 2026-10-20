"use client";

import { useEffect } from "react";
import { FileTextIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { submitReportAction } from "@/app/actions/reports";

/** Adds the reviewed totals for a date range to a Google Doc. */
export function SendReportPanel({ from, to, defaultDocUrl }: { from: string; to: string; defaultDocUrl: string }) {
  const { state, pending, formProps } = useFormAction(submitReportAction);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Sent.");
  }, [state]);

  return (
    <form {...formProps} className="grid gap-3 rounded-xl border bg-card p-4 lg:max-w-xl">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div className="flex items-center gap-2 font-semibold">
        <FileTextIcon className="size-4 text-primary" />
        Add to a Google Doc
      </div>
      <Field
        label="Google Doc link"
        name="doc_url"
        defaultValue={defaultDocUrl}
        placeholder="https://docs.google.com/document/d/…/edit"
        hint="The report is added to the end of this document."
        required
      />
      <FormMessage state={state?.ok ? null : state} />
      <SubmitButton pending={pending} pendingText="Sending…">
        <SendIcon />
        Send to Google Doc
      </SubmitButton>
    </form>
  );
}
