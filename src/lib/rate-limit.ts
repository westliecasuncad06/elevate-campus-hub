import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting for the places a bot or a password guesser would hammer (sign-in, registration codes, two-step codes,
 * invitation emails). Counters live in the database (see migration 0017) because the app runs on serverless functions
 * that share no memory. Names, emails and addresses are stored only as a keyed hash, never as text.
 *
 * If the counters can't be reached the request is let through: a database hiccup must not lock everybody out.
 */

export interface Limit {
  /** Built with rateKey(). */
  key: string;
  /** Attempts allowed in the window. */
  limit: number;
  windowSeconds: number;
  /** A lock that lasts the FULL window from the attempt that reaches the limit ("4 wrong, then wait 60 seconds"). */
  lockFromLimit?: boolean;
}

export type RateResult = { ok: true } | { ok: false; retryAfter: number; firstBlock: boolean };

function secret(): string {
  return process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "elevate-campus-hub";
}

/** "login:ip:3f9a…": the scope, then a keyed hash of the values, so the table holds no names, emails or addresses. */
export function rateKey(scope: string, ...values: string[]): string {
  const hash = createHmac("sha256", secret()).update(values.join("\u0000").toLowerCase()).digest("hex").slice(0, 32);
  return `${scope}:${hash}`;
}

/** The visitor's address as the host reports it (Vercel sets x-forwarded-for itself, so it can't be forged from outside). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || h.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Counts one attempt against every limit; blocked if ANY of them is exceeded. */
export async function checkRateLimits(limits: Limit[]): Promise<RateResult> {
  try {
    const admin = createAdminClient();
    const results = await Promise.all(
      limits.map(async (l) => {
        const { data, error } = await admin.rpc("rate_limit_hit", {
          p_key: l.key,
          p_limit: l.limit,
          p_window_seconds: l.windowSeconds,
          p_restart_at_limit: l.lockFromLimit ?? false,
        });
        if (error || !Array.isArray(data) || data.length === 0) return null;
        const row = data[0] as { allowed: boolean; hits: number; retry_after: number };
        return { ...row, limit: l.limit };
      }),
    );
    const blocked = results.filter((r) => r && !r.allowed) as { hits: number; retry_after: number; limit: number }[];
    if (blocked.length === 0) return { ok: true };
    return {
      ok: false,
      retryAfter: Math.max(...blocked.map((r) => r.retry_after)),
      // True only for the very first attempt past the limit, so the event is logged once and not on every blocked try.
      firstBlock: blocked.some((r) => r.hits === r.limit + 1),
    };
  } catch (error) {
    console.error("rate limit check failed (letting the request through):", error);
    return { ok: true };
  }
}

/** Takes one attempt back, for a counter shared by many people (everyone behind one Wi-Fi address). */
export async function refundRateLimit(key: string): Promise<void> {
  try {
    await createAdminClient().rpc("rate_limit_refund", { p_key: key });
  } catch {
    // Not important enough to fail the request.
  }
}

/** Forgets a counter, for example after a successful sign-in. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await createAdminClient().rpc("rate_limit_reset", { p_key: key });
  } catch {
    // Not important enough to fail the request.
  }
}

export { tooManyMessage } from "@/lib/wait-message";

/** Writes "someone was blocked" to the system log (once per block, not per attempt). */
export async function logBlock(event: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await createAdminClient().from("system_logs").insert({ event, level: "warn", detail });
  } catch {
    // Logging must never break the request.
  }
}
