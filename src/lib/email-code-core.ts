/**
 * The small, pure pieces of the emailed sign-in code: making a code, hashing it, checking what was typed, hiding most of
 * an email address, and reading the session id out of a token. (The parts that need the database or email are in
 * email-code.ts.) Only Node's crypto is used, so this file is also loaded by tests.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_LENGTH = 6;
/** A code stops working after this many minutes. */
export const CODE_MINUTES = 10;
/** A code stops working after this many wrong guesses (then a new one has to be requested). */
export const CODE_MAX_ATTEMPTS = 5;

/** A random 6-digit code, with leading zeros kept ("004217"). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Only a keyed hash of the code is stored, tied to the person, so a leaked table can't be used to sign in. */
export function hashCode(secret: string, userId: string, code: string): string {
  return createHmac("sha256", secret).update(`code:${userId}:${code}`).digest("hex");
}

/** Compares in constant time, so the time taken doesn't hint at how many digits were right. */
export function codeMatches(secret: string, userId: string, typed: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(secret, userId, typed), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What was typed, as digits ("123 456" and "123-456" are fine), or null when it isn't a 6-digit code. */
export function parseCodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** "juandelacruz@gmail.com" -> "ju*********@gmail.com": enough to recognise it, not enough to learn it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "your email";
  const name = email.slice(0, at);
  // A short name shows only its first letter, so almost nothing is given away.
  const shown = name.slice(0, name.length <= 3 ? 1 : 2);
  return `${shown}${"*".repeat(Math.max(3, Math.min(name.length - shown.length, 9)))}${email.slice(at)}`;
}

/** The random token kept in a browser's cookie once it has passed the check. */
export function newTrustToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(secret: string, token: string): string {
  return createHmac("sha256", secret).update(`trust:${token}`).digest("hex");
}

/** Did that moment happen within the last `hours` hours? */
export function isWithinHours(at: string | Date, hours: number, now: Date = new Date()): boolean {
  const when = new Date(at).getTime();
  if (Number.isNaN(when)) return false;
  return now.getTime() - when < hours * 3_600_000 && when <= now.getTime() + 60_000;
}

/** The id of the sign-in session, read from a token we have just been handed by Supabase (not verified: only used to label it). */
export function sessionIdFromToken(jwt: string | undefined | null): string | null {
  if (!jwt) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof payload.session_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}
