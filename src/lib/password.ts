/**
 * Rules for a NEW password (choosing one, or an IT reset). Signing in with an older, shorter password still works:
 * these checks apply only when a password is set.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** The passwords attackers try first. Matching ignores case and anything that isn't a letter or digit. */
const COMMON = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "p4ssw0rd",
  "qwerty",
  "qwertyuiop",
  "qwerty123",
  "qwerty1234",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
  "12345678910",
  "123456789",
  "0123456789",
  "9876543210",
  "iloveyou",
  "iloveyou1",
  "welcome1",
  "welcome123",
  "letmein",
  "letmein123",
  "admin123",
  "adminadmin",
  "abc123456",
  "abcd1234",
  "abcdefghij",
  "changeme",
  "changeme123",
  "elevate",
  "elevate123",
  "elevatecampus",
  "elevatecampushub",
  "campushub",
  "campushub123",
  "church123",
  "jesus123",
  "godisgood",
  "blessed123",
  "philippines",
  "pilipinas",
  "mahalkita",
  "iloveyou123",
  "demoelevate2026",
]);

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The message to show, or null when the password is acceptable. */
export function validateNewPassword(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess. Mix letters, numbers and symbols.";

  const flat = squash(password);
  if (COMMON.has(flat)) return "That password is too common. Pick something only you would think of.";

  // A run like 12345678, abcdefgh or 87654321 by itself.
  const ascending = "0123456789012345678901234567890";
  const letters = "abcdefghijklmnopqrstuvwxyz";
  if (flat.length >= 8 && [ascending, [...ascending].reverse().join(""), letters, [...letters].reverse().join("")].some((run) => run.includes(flat))) {
    return "That password is too easy to guess. Mix letters, numbers and symbols.";
  }

  if (email) {
    const local = squash(email.split("@")[0] ?? "");
    if (local.length >= 4 && flat.includes(local)) return "Your password shouldn't contain your email name.";
  }
  return null;
}
