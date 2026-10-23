"use client";

import { useEffect } from "react";
import { Honeypot, Turnstile } from "@/components/bot-guard";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";
import { registerWithCode } from "./actions";

export function RegisterForm({ email, code }: { email: string; code: string }) {
  const { state, pending, formProps } = useFormAction(registerWithCode);

  // The code came in the link: take it out of the address bar (and browser history) now that it's in the form.
  useEffect(() => {
    if (code) window.history.replaceState(null, "", window.location.pathname);
  }, [code]);

  return (
    <form {...formProps} className="relative grid gap-4">
      <Honeypot />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={email}
        hint="The address your invitation was sent to."
        maxLength={254}
        required
        autoFocus={!email}
      />
      <Field
        label="Registration code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        defaultValue={code}
        maxLength={14}
        className="[&_input]:text-center [&_input]:font-mono [&_input]:text-2xl [&_input]:tracking-[0.4em]"
        required
        autoFocus={Boolean(email) && !code}
      />
      <Turnstile resetKey={state} />
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Checking…" autoFocus={Boolean(email && code)}>
        Continue
      </SubmitButton>
    </form>
  );
}
