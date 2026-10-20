"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useFormAction } from "@/components/use-form-action";
import { KeyRoundIcon, MailIcon, ShieldOffIcon } from "lucide-react";
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
import { Field, FormMessage, FormSelect, SubmitButton, type Option } from "@/components/forms";
import {
  reassignFacilitatorAction,
  resendInvitationAction,
  resetPasswordAction,
  resetTwoStepAction,
  setActiveAction,
} from "@/app/actions/accounts";
import type { ActionResult } from "@/lib/types";

function useRunAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error);
    });
  return { pending, run };
}

export function ResendInviteButton({ profileId }: { profileId: string }) {
  const { pending, run } = useRunAction();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(() => resendInvitationAction(profileId))}
    >
      <MailIcon />
      {pending ? "Sending…" : "Resend invitation"}
    </Button>
  );
}

export function ActiveToggleButton({ profileId, active }: { profileId: string; active: boolean }) {
  const { pending, run } = useRunAction();
  return (
    <Button
      variant={active ? "ghost" : "secondary"}
      size="sm"
      disabled={pending}
      onClick={() => run(() => setActiveAction(profileId, !active))}
    >
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}

/** Super Admin / Campus Head: remove someone's two-step verification (they lost their phone). Asks first. */
export function ResetTwoStepButton({ profileId, name }: { profileId: string; name: string }) {
  const { pending, run } = useRunAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldOffIcon />
        Reset 2-step
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset two-step verification for {name}?</DialogTitle>
            <DialogDescription>
              Use this when they lost the phone with their authenticator app. They can then sign in with just their password,
              and turn two-step verification on again from Account &amp; security. Only do it after you are sure it really is them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                run(() => resetTwoStepAction(profileId));
                setOpen(false);
              }}
            >
              {pending ? "Resetting…" : "Reset 2-step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Super Admin: set a new password for someone directly (no email). */
export function ResetPasswordButton({ profileId, name }: { profileId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <KeyRoundIcon />
        Reset password
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <ResetPasswordForm key={formKey} profileId={profileId} name={name} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResetPasswordForm({ profileId, name, onDone }: { profileId: string; name: string; onDone: () => void }) {
  const { state, pending, formProps } = useFormAction(resetPasswordAction.bind(null, profileId));

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Password reset.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form {...formProps} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Reset password for {name}</DialogTitle>
        <DialogDescription>
          Type a temporary password and tell them in person. They&apos;ll be asked to choose their own the next time
          they sign in.
        </DialogDescription>
      </DialogHeader>
      <Field label="Temporary password" name="password" type="text" autoComplete="off" minLength={10} required />
      <FormMessage state={state?.ok ? null : state} />
      <DialogFooter>
        <SubmitButton pending={pending} pendingText="Resetting…">
          Reset password
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

/** Campus Head: change which facilitator a student belongs to. */
export function ReassignFacilitator({
  studentId,
  currentId,
  facilitators,
}: {
  studentId: string;
  currentId: string | null;
  facilitators: Option[];
}) {
  const { pending, run } = useRunAction();
  const options: Option[] = [{ value: "none", label: "No facilitator" }, ...facilitators];

  return (
    <div className="min-w-44">
      <FormSelect
        key={currentId ?? "none"}
        label=""
        name={`facilitator-${studentId}`}
        options={options}
        defaultValue={currentId ?? "none"}
        onValueChange={(value) => {
          const next = value === "none" || !value ? null : value;
          if (next === currentId) return;
          run(() => reassignFacilitatorAction(studentId, next));
        }}
        className={pending ? "opacity-60" : undefined}
      />
    </div>
  );
}
