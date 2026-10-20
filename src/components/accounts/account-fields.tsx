"use client";

import { Field, FormSelect, type Option } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import type { Program, Role } from "@/lib/types";

const GENDER_OPTIONS: Option[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const YEAR_OPTIONS: Option[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Year ${n}` }));

/** The inputs shared by every "create an account" form. Renders fields appropriate to the role. */
export function AccountFields({
  role,
  programs = [],
  campuses,
}: {
  role: Role;
  programs?: Program[];
  /** Super Admin picks the campus; everyone else uses their own. */
  campuses?: Option[];
}) {
  const isStudent = role === "student";
  const needsGender = role === "student" || role === "facilitator";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {campuses ? (
        <FormSelect label="Campus" name="campus_id" options={campuses} required className="sm:col-span-2" />
      ) : null}
      <Field label="First name" name="first_name" autoComplete="off" required />
      <Field label="Last name" name="last_name" autoComplete="off" required />
      <Field
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="09XX XXX XXXX"
        required={isStudent}
      />
      <Field label="Email" name="email" type="email" autoComplete="off" required />
      {needsGender ? <FormSelect label="Gender" name="gender" options={GENDER_OPTIONS} required /> : null}
      <Field label="Birthday" name="birthday" type="date" required={isStudent} />
      {isStudent ? (
        <>
          <FormSelect
            label="Program"
            name="program_id"
            options={programs.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            placeholder="Select a program"
            required
          />
          <FormSelect label="Year level" name="year_level" options={YEAR_OPTIONS} required />
          <Field label="Church (optional)" name="church" autoComplete="off" />
          <Field label="Religion (optional)" name="religion" autoComplete="off" />
          <Field label="Student number (optional)" name="student_number" autoComplete="off" className="sm:col-span-2" />
        </>
      ) : null}
      <PrivacyConsent role={role} mode="register" className="sm:col-span-2" />
    </div>
  );
}
