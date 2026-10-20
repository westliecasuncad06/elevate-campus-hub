"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage, SubmitButton } from "@/components/forms";
import type { ActionResult } from "@/lib/types";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

interface FormDialogProps {
  action: FormAction;
  title: string;
  description?: string;
  submitLabel: string;
  pendingLabel?: string;
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  wide?: boolean;
  children: React.ReactNode;
}

/** A button that opens a dialog containing a form wired to a server action. */
export function FormDialog({
  triggerLabel,
  triggerIcon,
  triggerVariant,
  triggerSize,
  wide,
  ...rest
}: FormDialogProps) {
  const [open, setOpen] = useState(false);
  // Remount the form each time the dialog opens so inputs and messages start fresh.
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        aria-label={triggerLabel ? undefined : rest.title}
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {triggerIcon}
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={wide ? "max-h-[90dvh] overflow-y-auto sm:max-w-xl" : "max-h-[90dvh] overflow-y-auto"}>
          <FormBody key={formKey} onDone={close} {...rest} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormBody({
  action,
  title,
  description,
  submitLabel,
  pendingLabel,
  onDone,
  children,
}: Pick<FormDialogProps, "action" | "title" | "description" | "submitLabel" | "pendingLabel" | "children"> & {
  onDone: () => void;
}) {
  const { state, pending, formProps } = useFormAction(action);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form {...formProps} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      {children}
      <FormMessage state={state?.ok ? null : state} />
      <DialogFooter>
        <SubmitButton pending={pending} pendingText={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
