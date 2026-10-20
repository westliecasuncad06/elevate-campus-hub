"use client";

import { Field, FormMessage, FormSelect, SubmitButton } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import { useFormAction } from "@/components/use-form-action";
import type { Role } from "@/lib/types";
import { setPassword } from "./actions";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function SetPasswordForm({
  role,
  needsPrivacy,
  needsDetails,
}: {
  role: Role;
  needsPrivacy: boolean;
  /** Invited by email only: ask for their own name and details too. */
  needsDetails: boolean;
}) {
  const { state, pending, formProps } = useFormAction(setPassword);

  return (
    <form {...formProps} className="grid gap-4">
      {needsDetails ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="first_name" autoComplete="given-name" required autoFocus />
          <Field label="Last name" name="last_name" autoComplete="family-name" required />
          <FormSelect
            label={role === "facilitator" ? "Gender" : "Gender (optional)"}
            name="gender"
            options={GENDER_OPTIONS}
            required={role === "facilitator"}
            placeholder="Select"
          />
          <Field label="Phone number (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" />
          <Field label="Birthday (optional)" name="birthday" type="date" autoComplete="bday" className="sm:col-span-2" />
          {role === "facilitator" ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Your gender decides which students you can chat with: a facilitator and a student chat only if they are the same gender.
            </p>
          ) : null}
        </div>
      ) : null}
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
        autoFocus={!needsDetails}
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
