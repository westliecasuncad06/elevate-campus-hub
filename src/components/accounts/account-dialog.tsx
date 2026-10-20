"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { PlusIcon } from "lucide-react";
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
import { FormMessage, SubmitButton, type Option } from "@/components/forms";
import { createAccountAction } from "@/app/actions/accounts";
import { AccountFields } from "./account-fields";
import { ROLE_LABEL } from "@/lib/roles";
import type { Program, Role } from "@/lib/types";

/** Button + dialog that creates an account and emails the invitation. */
export function AccountDialog({
  role,
  programs,
  campuses,
  label,
}: {
  role: Role;
  programs?: Program[];
  campuses?: Option[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // A key remounts the form (clearing inputs) every time the dialog reopens.
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <PlusIcon />
        {label ?? `Add ${ROLE_LABEL[role].toLowerCase()}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <AccountForm
            key={formKey}
            role={role}
            programs={programs}
            campuses={campuses}
            onDone={close}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountForm({
  role,
  programs,
  campuses,
  onDone,
}: {
  role: Role;
  programs?: Program[];
  campuses?: Option[];
  onDone: () => void;
}) {
  const { state, pending, formProps } = useFormAction(createAccountAction.bind(null, role));

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Account created.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form {...formProps} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Add {ROLE_LABEL[role].toLowerCase()}</DialogTitle>
        <DialogDescription>
          They&apos;ll get an email with a link to choose their own password.
        </DialogDescription>
      </DialogHeader>
      <AccountFields role={role} programs={programs} campuses={campuses} />
      <FormMessage state={state?.ok ? null : state} />
      <DialogFooter>
        <SubmitButton pending={pending} pendingText="Sending invitation…">
          Send invitation
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}
