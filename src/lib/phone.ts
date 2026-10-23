/**
 * Normalizes Philippine mobile numbers so lookups match however they were typed:
 * "+63 917 123 4567", "63917-123-4567" and "9171234567" all become "09171234567".
 * Anything else is returned as digits only.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `0${digits}`;
  return digits;
}

/** A Philippine mobile number as stored: exactly 11 digits, starting with 09 (what normalizePhone returns). */
export function isValidPhone(normalized: string): boolean {
  return /^09\d{9}$/.test(normalized);
}

export function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}
