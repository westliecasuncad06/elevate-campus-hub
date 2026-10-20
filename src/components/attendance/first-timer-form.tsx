"use client";

import { useEffect } from "react";
import { AccountFields } from "@/components/accounts/account-fields";
import { FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { registerFirstTimerAction, type AttendanceOutcome } from "@/app/actions/attendance";
import type { Program } from "@/lib/types";

/** Register a brand-new student and mark them present in one step. */
export function FirstTimerForm({
  batchId,
  programs,
  onRegistered,
}: {
  batchId: string;
  programs: Program[];
  onRegistered: (outcome: AttendanceOutcome) => void;
}) {
  const { state, pending, formProps } = useFormAction<AttendanceOutcome>(registerFirstTimerAction.bind(null, batchId));

  useEffect(() => {
    if (state?.ok && state.data) onRegistered(state.data);
  }, [state, onRegistered]);

  return (
    <form {...formProps} className="mx-auto grid w-full max-w-xl gap-5">
      <div>
        <h2 className="text-lg font-semibold">New student</h2>
        <p className="text-sm text-muted-foreground">
          They&apos;ll be added to this batch right away and get an email to set their password.
        </p>
      </div>
      <AccountFields role="student" programs={programs} />
      <FormMessage state={state?.ok ? null : state} />
      <SubmitButton size="lg" pending={pending} pendingText="Registering…">
        Register and add to batch
      </SubmitButton>
    </form>
  );
}
