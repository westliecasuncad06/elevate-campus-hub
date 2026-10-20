/** Helpers for people who are invited by email only and then register themselves. */

/**
 * Until someone registers we only know their email, so that is what they are called: the part before the "@".
 * (Their real name replaces it when they register.)
 */
export function placeholderName(email: string): string {
  return email.split("@")[0].trim().slice(0, 80) || "New user";
}

/**
 * The digits of the registration code someone typed ("123456", "123 456" and "123-456" are all fine), or null if it isn't
 * a plausible code. The invitation email's code is Supabase's email OTP: 6 digits when the project's "Email OTP Length"
 * is 6 (the intended setting), but Supabase allows 6 to 10, so any of those is accepted here and Supabase decides.
 */
export function parseRegistrationCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}

/**
 * The email in a "/register?email=..." link. A "+" in an address (me+school@gmail.com) turns into a space when it travels
 * in a link, and an email can't contain a space, so put the "+" back.
 */
export function emailFromLink(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/ /g, "+");
}
