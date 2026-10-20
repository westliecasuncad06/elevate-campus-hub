"use client";

import { useEffect } from "react";
import { FileTextIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { submitReportAction } from "@/app/actions/reports";

/** Step 2 of sending: the summary has been reviewed, so this posts it to Google. */
export function SendReportPanel({
  from,
  to,
  defaultDocUrl,
  hasFormTarget,
}: {
  from: string;
  to: string;
  defaultDocUrl: string;
  hasFormTarget: boolean;
}) {
  const docs = useFormAction(submitReportAction.bind(null, "google_docs"));
  const form = useFormAction(submitReportAction.bind(null, "google_form"));

  useEffect(() => {
    if (docs.state?.ok) toast.success(docs.state.message ?? "Sent.");
  }, [docs.state]);
  useEffect(() => {
    if (form.state?.ok) toast.success(form.state.message ?? "Sent.");
  }, [form.state]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form {...docs.formProps} className="grid gap-3 rounded-xl border bg-card p-4">
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
        <FormMessage state={docs.state?.ok ? null : docs.state} />
        <SubmitButton pending={docs.pending} pendingText="Sending…">
          <SendIcon />
          Send to Google Doc
        </SubmitButton>
      </form>

      <form {...form.formProps} className="grid content-start gap-3 rounded-xl border bg-card p-4">
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <div className="flex items-center gap-2 font-semibold">
          <SendIcon className="size-4 text-primary" />
          Submit to the Google Form
        </div>
        <p className="text-sm text-muted-foreground">
          {hasFormTarget
            ? "Sends the same numbers to your ministry's Google Form."
            : "Needs a Google Apps Script link. Ask IT to set it up. Until then, the form step is a placeholder."}
        </p>
        <FormMessage state={form.state?.ok ? null : form.state} />
        <SubmitButton variant="outline" pending={form.pending} pendingText="Sending…">
          Submit to Google Form
        </SubmitButton>
      </form>
    </div>
  );
}
