"use client";

import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useFormAction(signIn);

  return (
    <form {...formProps} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
