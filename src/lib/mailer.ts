import "server-only";
import { parseSender } from "@/lib/email-templates";

/**
 * Sends the app's own emails (the sign-in code). Supabase sends invitations and password emails itself, but it can't send
 * a message we write, and its built-in sender is limited to a handful of emails an hour, so sign-in codes go through a
 * free email service instead. Set ONE of these in Vercel (and .env.local):
 *
 *   BREVO_API_KEY    Brevo (300 emails a day free). Create an API key, and verify the sender address under Senders.
 *   RESEND_API_KEY   Resend (3,000 a month free). Needs a verified domain for its sender address.
 *   EMAIL_FROM       "Elevate Campus Hub <you@gmail.com>" (the verified sender address)
 *
 * While developing (not in production) with none of them set, the email is printed to the server log instead.
 */

export type MailerProvider = "brevo" | "resend" | "dev";

export interface MailerStatus {
  configured: boolean;
  provider: MailerProvider | null;
  /** What is missing, in words, when it isn't configured. */
  problem: string | null;
}

export function mailerStatus(): MailerStatus {
  const from = process.env.EMAIL_FROM?.trim();
  if (process.env.BREVO_API_KEY?.trim()) {
    return from
      ? { configured: true, provider: "brevo", problem: null }
      : { configured: false, provider: "brevo", problem: "EMAIL_FROM is missing (the sender address you verified in Brevo)." };
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return from
      ? { configured: true, provider: "resend", problem: null }
      : { configured: false, provider: "resend", problem: "EMAIL_FROM is missing (an address on your verified Resend domain)." };
  }
  if (process.env.NODE_ENV !== "production") return { configured: true, provider: "dev", problem: null };
  return { configured: false, provider: null, problem: "No email service is set up yet (BREVO_API_KEY or RESEND_API_KEY, and EMAIL_FROM)." };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const status = mailerStatus();
  if (!status.configured || !status.provider) return { ok: false, error: status.problem ?? "Email isn't set up." };

  try {
    if (status.provider === "dev") {
      console.log(`[dev email] to ${message.to}: ${message.subject}\n${message.text}`);
      return { ok: true };
    }

    const from = process.env.EMAIL_FROM!.trim();
    if (status.provider === "brevo") {
      const sender = parseSender(from);
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!.trim(), "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, textContent: message.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, error: `Brevo refused the email (${res.status}).` };
      return { ok: true };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `Resend refused the email (${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: "The email service could not be reached." };
  }
}
