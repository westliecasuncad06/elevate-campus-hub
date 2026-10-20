/**
 * Sign in with Google. People still have to be invited first: public sign-ups are off in Supabase, so a Google
 * account only gets in when its email already belongs to someone a Campus Head / Super Admin invited.
 */

/** Which message /login shows when Google sign-in did not work out (see NOTICES in the login page). */
export type GoogleLoginError = "google_not_invited" | "google_failed";

/** Reads Supabase's public settings (`/auth/v1/settings`): is the Google provider switched on? */
export function googleEnabledFromSettings(settings: unknown): boolean {
  const external = (settings as { external?: { google?: unknown } } | null | undefined)?.external;
  return external?.google === true;
}

/**
 * Whether to show "Continue with Google". Asks Supabase (cached for a minute) so the button appears by itself once
 * the provider is turned on in the dashboard, and never shows a button that would only lead to an error.
 */
export async function isGoogleLoginEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    return googleEnabledFromSettings(await res.json());
  } catch {
    return false;
  }
}

/** True when this session was started by signing in with Google (the token's authentication methods say "oauth"). */
export function signedInWithGoogle(claims: unknown): boolean {
  const amr = (claims as { amr?: unknown } | null | undefined)?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => (entry as { method?: unknown } | null)?.method === "oauth");
}

/**
 * Supabase sends the person back to our callback with `?error=...&error_code=...&error_description=...` when the
 * sign-in failed. Returns null when there is no error in the URL.
 */
export function googleCallbackError(params: URLSearchParams): GoogleLoginError | null {
  const error = params.get("error");
  const code = params.get("error_code");
  const description = params.get("error_description") ?? "";
  if (!error && !code) return null;
  // Sign-ups are off, so a Google account that nobody invited is turned away here.
  if (code === "signup_disabled" || /signups? not allowed/i.test(description)) return "google_not_invited";
  return "google_failed";
}
