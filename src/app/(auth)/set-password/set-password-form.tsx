"use client";

import { Field, FormMessage, FormSelect, SubmitButton } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import { StudentNumberField } from "@/components/student-number-field";
import { useFormAction } from "@/components/use-form-action";
import { usesProgramList } from "@/lib/course";
import type { Program, Role } from "@/lib/types";
import { setPassword } from "./actions";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Year ${n}` }));

export function SetPasswordForm({
  role,
  needsPrivacy,
  needsDetails,
  passwordOptional,
  programs,
}: {
  role: Role;
  needsPrivacy: boolean;
  /** Invited by email only: ask for their own name and details too. */
  needsDetails: boolean;
  /** Signed in with Google: choosing a password is up to them. */
  passwordOptional: boolean;
  /** A student's campus programs (empty when the campus has none: the student types their course instead). */
  programs: Program[];
}) {
  const { state, pending, formProps } = useFormAction(setPassword);
  const isStudent = role === "student";

  return (
    <form {...formProps} className="grid gap-4">
      {needsDetails ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="first_name" autoComplete="given-name" required autoFocus />
          <Field label="Last name" name="last_name" autoComplete="family-name" required />
          <FormSelect
            label={role === "facilitator" || isStudent ? "Gender" : "Gender (optional)"}
            name="gender"
            options={GENDER_OPTIONS}
            required={role === "facilitator" || isStudent}
            placeholder="Select"
          />
          <Field
            label={isStudent ? "Phone number" : "Phone number (optional)"}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09XX XXX XXXX"
            required={isStudent}
          />
          <Field
            label={isStudent ? "Birthday" : "Birthday (optional)"}
            name="birthday"
            type="date"
            autoComplete="bday"
            required={isStudent}
            className={isStudent ? undefined : "sm:col-span-2"}
          />
          {isStudent ? (
            <>
              {usesProgramList(programs) ? (
                <FormSelect
                  label="Program"
                  name="program_id"
                  options={programs.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  placeholder="Select a program"
                  required
                />
              ) : (
                <Field label="Course" name="course" placeholder="For example BS Nursing" maxLength={80} autoComplete="off" required />
              )}
              <FormSelect label="Year level" name="year_level" options={YEAR_OPTIONS} placeholder="Select" required />
              <Field label="Church (optional)" name="church" autoComplete="off" />
              <Field label="Religion (optional)" name="religion" autoComplete="off" />
              <StudentNumberField className="sm:col-span-2" />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Your gender decides which facilitator you can chat with: a facilitator and a student chat only if they are the same gender.
              </p>
            </>
          ) : null}
          {role === "facilitator" ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Your gender decides which students you can chat with: a facilitator and a student chat only if they are the same gender.
            </p>
          ) : null}
        </div>
      ) : null}
      <Field
        label={passwordOptional ? "Password (optional)" : "New password"}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        hint={
          passwordOptional
            ? "Leave empty to sign in with Google only. Add one (at least 10 characters) if you also want to sign in with your email."
            : "At least 10 characters."
        }
        required={!passwordOptional}
        autoFocus={!needsDetails}
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required={!passwordOptional}
      />
      {needsPrivacy ? <PrivacyConsent role={role} mode="self" /> : null}
      <FormMessage state={state} />
      <SubmitButton size="lg" pending={pending} pendingText="Saving…">
        {needsPrivacy ? "Agree and create my account" : passwordOptional ? "Continue" : "Save password"}
      </SubmitButton>
    </form>
  );
}
