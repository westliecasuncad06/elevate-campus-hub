"use client";

import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import { useFormAction } from "@/components/use-form-action";
import type { Role } from "@/lib/types";
import { setPassword } from "./actions";

export function SetPasswordForm({ role, needsPrivacy }: { role: Role; needsPrivacy: boolean }) {
  const { state, pending, formProps } = useFormAction(setPassword);

  return (
    <form {...formProps} className="grid gap-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
        autoFocus
      />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      {needsPrivacy ? <PrivacyConsent role={role} mode="self" /> : null}
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Saving…">
        {needsPrivacy ? "Agree and create my account" : "Save password"}
      </SubmitButton>
    </form>
  );
}
