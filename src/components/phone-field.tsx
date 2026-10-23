"use client";

import { useState } from "react";
import { Field } from "@/components/forms";

/** The phone number box: digits only, at most 11 (09XXXXXXXXX). Anything else typed or pasted is dropped. */
export function PhoneField({
  label = "Phone number",
  name = "phone",
  defaultValue = "",
  required,
  readOnly,
  className,
  autoFocus,
  autoComplete = "off",
}: {
  label?: string;
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [value, setValue] = useState((defaultValue ?? "").replace(/\D/g, "").slice(0, 11));

  return (
    <Field
      label={label}
      name={name}
      type="tel"
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 11))}
      inputMode="numeric"
      autoComplete={autoComplete}
      placeholder="09XXXXXXXXX"
      maxLength={11}
      pattern="09[0-9]{9}"
      title="11 digits, starting with 09"
      required={required}
      readOnly={readOnly}
      autoFocus={autoFocus}
      className={className}
    />
  );
}
