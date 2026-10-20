import "server-only";

/** Did a bot fill in the hidden "website" box? (People never see it.) */
export function isBot(formData: FormData): boolean {
  const trap = formData.get("website");
  return typeof trap === "string" && trap.trim() !== "";
}

/**
 * Checks the Cloudflare Turnstile answer that came with the form. When Turnstile isn't set up (no TURNSTILE_SECRET_KEY)
 * this always passes, so the app works without it. When it IS set up, a missing or wrong answer fails.
 */
export async function verifyTurnstile(formData: FormData, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || token === "" || token.length > 4096) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    // If Cloudflare can't be reached we can't prove the visitor is human: refuse rather than let bots through.
    return false;
  }
}
