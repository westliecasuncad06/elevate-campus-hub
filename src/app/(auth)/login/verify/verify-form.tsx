"use client";

import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { verifyTwoStepAction } from "./actions";

export function VerifyForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useFormAction(verifyTwoStepAction);

  return (
    <form {...formProps} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label="6-digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="123456"
        className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
        required
        autoFocus
      />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Checking…">
        Verify and continue
      </SubmitButton>
    </form>
  );
}
