"use client";

import { Honeypot, Turnstile } from "@/components/bot-guard";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useFormAction(signIn);

  return (
    <form {...formProps} className="relative grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Honeypot />
      <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" maxLength={256} required />
      <Turnstile resetKey={state} />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
