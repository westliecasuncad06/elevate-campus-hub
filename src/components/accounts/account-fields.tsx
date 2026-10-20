"use client";

import { useState } from "react";
import { Field, FormSelect, type Option } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import { usesProgramList } from "@/lib/course";
import type { Program, Role } from "@/lib/types";

const GENDER_OPTIONS: Option[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const YEAR_OPTIONS: Option[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Year ${n}` }));

/** Values to pre-fill when editing an existing person. */
export interface AccountDefaults {
  campus_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null;
  church?: string | null;
  religion?: string | null;
  program_id?: string | null;
  course?: string | null;
  year_level?: number | null;
  student_number?: string | null;
}

/**
 * The inputs shared by every "create an account" form (and the Super Admin's edit form).
 * Renders fields appropriate to the role.
 *
 * A student's course is a dropdown when their campus has programs, and a typed "Course" box when it doesn't. When the
 * campus is chosen inside this form (Super Admin), the choice follows the campus picked.
 */
export function AccountFields({
  role,
  programs = [],
  programsByCampus,
  campuses,
  defaults,
  mode = "create",
}: {
  role: Role;
  /** The programs of the person's campus, when the campus is fixed (Campus Head, facilitator). */
  programs?: Program[];
  /** Programs for every campus, when the campus is picked in this form (Super Admin). */
  programsByCampus?: Record<string, Program[]>;
  /** Super Admin picks the campus; everyone else uses their own. */
  campuses?: Option[];
  defaults?: AccountDefaults;
  /** "edit" pre-fills, and drops the consent box (consent was recorded when the person was registered). */
  mode?: "create" | "edit";
}) {
  const isStudent = role === "student";
  const needsGender = role === "student" || role === "facilitator";
  const [campusId, setCampusId] = useState(defaults?.campus_id ?? "");

  const campusPrograms = campuses ? (programsByCampus?.[campusId] ?? []) : programs;
  const campusPicked = !campuses || campusId !== "";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {campuses ? (
        <FormSelect
          label="Campus"
          name="campus_id"
          options={campuses}
          defaultValue={defaults?.campus_id ?? undefined}
          onValueChange={setCampusId}
          required
          className="sm:col-span-2"
        />
      ) : null}
      <Field label="First name" name="first_name" defaultValue={defaults?.first_name} autoComplete="off" required />
      <Field label="Last name" name="last_name" defaultValue={defaults?.last_name} autoComplete="off" required />
      <Field
        label="Phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        defaultValue={defaults?.phone ?? ""}
        autoComplete="off"
        placeholder="09XX XXX XXXX"
        required={isStudent}
      />
      <Field label="Email" name="email" type="email" defaultValue={defaults?.email} autoComplete="off" required />
      {needsGender ? (
        <FormSelect label="Gender" name="gender" options={GENDER_OPTIONS} defaultValue={defaults?.gender ?? undefined} required />
      ) : null}
      <Field label="Birthday" name="birthday" type="date" defaultValue={defaults?.birthday ?? ""} required={isStudent} />
      {isStudent ? (
        <>
          {!campusPicked ? (
            <p className="self-end text-sm text-muted-foreground">Pick a campus to see its course options.</p>
          ) : usesProgramList(campusPrograms) ? (
            <FormSelect
              // A new campus means a different list, so start the dropdown over.
              key={campusId}
              label="Program"
              name="program_id"
              options={campusPrograms.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
              defaultValue={campusPrograms.some((p) => p.id === defaults?.program_id) ? (defaults?.program_id ?? undefined) : undefined}
              placeholder="Select a program"
              required
            />
          ) : (
            <Field
              key={campusId}
              label="Course"
              name="course"
              defaultValue={defaults?.course ?? ""}
              placeholder="For example BS Nursing"
              maxLength={80}
              autoComplete="off"
              required
            />
          )}
          <FormSelect
            label="Year level"
            name="year_level"
            options={YEAR_OPTIONS}
            defaultValue={defaults?.year_level ? String(defaults.year_level) : undefined}
            required
          />
          <Field label="Church (optional)" name="church" defaultValue={defaults?.church ?? ""} autoComplete="off" />
          <Field label="Religion (optional)" name="religion" defaultValue={defaults?.religion ?? ""} autoComplete="off" />
          <Field
            label="Student number (optional)"
            name="student_number"
            defaultValue={defaults?.student_number ?? ""}
            autoComplete="off"
            className="sm:col-span-2"
          />
        </>
      ) : null}
      {mode === "create" ? <PrivacyConsent role={role} mode="register" className="sm:col-span-2" /> : null}
    </div>
  );
}
