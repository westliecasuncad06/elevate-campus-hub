"use client";

import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { registerWithCode } from "./actions";

export function RegisterForm({ email }: { email: string }) {
  const { state, pending, formProps } = useFormAction(registerWithCode);

  return (
    <form {...formProps} className="grid gap-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={email}
        hint="The address your invitation was sent to."
        required
        autoFocus={!email}
      />
      <Field
        label="Registration code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={14}
        className="[&_input]:text-center [&_input]:font-mono [&_input]:text-2xl [&_input]:tracking-[0.4em]"
        required
        autoFocus={Boolean(email)}
      />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Checking…">
        Continue
      </SubmitButton>
    </form>
  );
}
