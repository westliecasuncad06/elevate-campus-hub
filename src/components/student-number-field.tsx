"use client";

import { useState } from "react";
import { Field } from "@/components/forms";
import { formatStudentNumberInput, STUDENT_NUMBER_HINT } from "@/lib/student-number";

/** The student number box: type the digits and the dashes (2017-05-07107) appear by themselves. */
export function StudentNumberField({
  label = "Student number",
  name = "student_number",
  defaultValue = "",
  readOnly,
  className,
  autoFocus,
}: {
  label?: string;
  name?: string;
  defaultValue?: string | null;
  /** Already typed earlier (at the kiosk): shown, submitted with the form, but not editable. */
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(formatStudentNumberInput(defaultValue ?? ""));

  return (
    <Field
      label={label}
      name={name}
      value={value}
      onChange={(e) => setValue(formatStudentNumberInput(e.target.value))}
      readOnly={readOnly}
      inputMode="numeric"
      autoComplete="off"
      placeholder="2017-05-07107"
      maxLength={13}
      required
      autoFocus={autoFocus}
      hint={readOnly ? undefined : STUDENT_NUMBER_HINT}
      className={className}
    />
  );
}
