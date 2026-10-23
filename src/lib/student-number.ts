/**
 * Student numbers look like 2017-05-07107 (4 digits, 2 digits, 5 digits). People type only the digits and the dashes
 * appear by themselves; what is stored and compared is always the dashed form.
 */

const DIGITS = 11;
const CANONICAL = /^\d{4}-\d{2}-\d{5}$/;

/** Live formatting while typing: keeps the digits (at most 11) and puts the dashes in after the 4th and 6th. */
export function formatStudentNumberInput(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, DIGITS);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** The dashed student number for what was typed ("201705 07107", "2017-05-07107"), or null if it isn't a full one. */
export function parseStudentNumber(input: string): string | null {
  const formatted = formatStudentNumberInput(input);
  return CANONICAL.test(formatted) && input.replace(/\D/g, "").length === DIGITS ? formatted : null;
}

export const STUDENT_NUMBER_HINT = "Like 2017-05-07107";
