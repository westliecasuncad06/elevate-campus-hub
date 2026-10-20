"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ExternalLinkIcon, PlusIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addGoogleFormAction, removeGoogleFormAction } from "@/app/actions/google-forms";

export interface SavedForm {
  id: string;
  name: string;
  url: string;
}

/** Add or remove the Google Forms a daily report can be sent to. */
export function ManageFormsDialog({
  forms,
  triggerLabel = "Manage forms",
  triggerVariant = "outline",
}: {
  forms: SavedForm[];
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={() => setOpen(true)}>
        {forms.length === 0 ? <PlusIcon /> : <Settings2Icon />}
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Google Forms for your reports</DialogTitle>
            <DialogDescription>
              Save the forms you send reports to, then pick one when you send. Each link is checked before it is saved.
            </DialogDescription>
          </DialogHeader>
          <SavedList forms={forms} />
          <AddForm />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SavedList({ forms }: { forms: SavedForm[] }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(id: string) {
    start(async () => {
      const result = await removeGoogleFormAction(id);
      setConfirmId(null);
      if (result.ok) toast.success(result.message ?? "Removed.");
      else toast.error(result.error);
    });
  }

  if (forms.length === 0) {
    return <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No forms saved yet.</p>;
  }

  return (
    <ul className="grid gap-2" aria-label="Saved Google Forms">
      {forms.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{f.name}</p>
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Open form
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
          {confirmId === f.id ? (
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => remove(f.id)}>
                {pending ? "Removing…" : "Yes, remove"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmId(null)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmId(f.id)} aria-label={`Remove ${f.name}`}>
              <Trash2Icon />
              Remove
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AddForm() {
  const { state, pending, formProps } = useFormAction(addGoogleFormAction);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved.");
      formRef.current?.reset(); // the inputs start empty again, ready for another form
    }
  }, [state]);

  return (
    <form {...formProps} ref={formRef} className="grid gap-3 rounded-lg bg-secondary/60 p-3">
      <p className="font-semibold">Add a form</p>
      <div className="grid gap-3">
        <Field
          label="Google Form link"
          name="url"
          placeholder="https://docs.google.com/forms/d/e/…/viewform"
          hint="Use the form's public link (Send → link). It must accept responses without a Google sign-in."
          required
        />
        <Field label="Name (optional)" name="name" maxLength={80} placeholder="Uses the form's title if empty" />
      </div>
      <FormMessage state={state?.ok ? null : state} />
      <div>
        <SubmitButton pending={pending} pendingText="Checking the form…">
          Check and save
        </SubmitButton>
      </div>
    </form>
  );
}
