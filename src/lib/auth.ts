import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailGate, getSecuritySettingsCached } from "@/lib/email-code";
import { signedInWithGoogle } from "@/lib/google-login";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import type { Campus, Profile, Role } from "@/lib/types";

/** The verified claims of the current session's token (null when signed out). Checked once per request. */
const getSessionClaims = cache(async (): Promise<Record<string, unknown> | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims as Record<string, unknown> | undefined) ?? null;
});

/**
 * The profile of whoever's session this is, whether or not they have finished their second sign-in step yet.
 * Only the code pages need to see this; everything else uses getSessionProfile().
 */
export const loadSessionProfile = cache(async (): Promise<Profile | null> => {
  const claims = await getSessionClaims();
  const userId = claims?.sub;
  if (typeof userId !== "string") return null;

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  if (profile) return profile;

  // The database refuses a session that still owes its second step (an authenticator code, or the emailed code), which is
  // the point, so that person's own profile can't be read that way. The token is verified, so it is safe to look up WHO this
  // is with the server's key; what they may do next is still decided by the checks below.
  const { data } = await createAdminClient().from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  return data ?? null;
});

/** Which second sign-in step this session still owes: the authenticator code, the emailed code, or none. */
const secondStepFor = cache(
  async (userId: string, role: Role, isActive: boolean, mfaEnabled: boolean): Promise<"totp" | "email" | null> => {
    const claims = await getSessionClaims();
    // "Continue with Google" is the easy login: never asked for a code.
    if (signedInWithGoogle(claims)) return null;
    // Authenticator app (aal2 = passed it). It is the stronger of the two, so it replaces the emailed code.
    if (mfaEnabled) return claims?.aal === "aal2" ? null : "totp";

    const settings = await getSecuritySettingsCached();
    if (!settings.enabled || !settings.roles.includes(role) || !isActive) return null;
    const sessionId = typeof claims?.session_id === "string" ? claims.session_id : null;
    const gate = await emailGate(userId, sessionId);
    return gate.required && !gate.verified ? "email" : null;
  },
);

export function secondStep(profile: Pick<Profile, "id" | "role" | "is_active" | "mfa_enabled">) {
  return secondStepFor(profile.id, profile.role, profile.is_active, profile.mfa_enabled);
}

/** Has this session done everything the account asks for to sign in? */
export async function mfaPending(profile: Pick<Profile, "id" | "role" | "is_active" | "mfa_enabled">): Promise<boolean> {
  return (await secondStep(profile)) !== null;
}

/** Where a session that still owes a second step goes. */
function secondStepPath(step: "totp" | "email"): string {
  return step === "totp" ? "/login/verify" : "/login/email-code";
}

/** The signed-in user's profile row, or null when signed out OR still waiting to enter a code. */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const profile = await loadSessionProfile();
  if (!profile) return null;
  return (await mfaPending(profile)) ? null : profile;
});

/** Pages that work from a half-signed-in session (set password, privacy notice) send people to the code step first. */
export async function requireMfaStep(): Promise<void> {
  const profile = await loadSessionProfile();
  if (!profile) return;
  const step = await secondStep(profile);
  if (step) redirect(secondStepPath(step));
}

/** Whether the current session was started with "Continue with Google" (as opposed to a password or an email link). */
export async function isGoogleSession(): Promise<boolean> {
  return signedInWithGoogle(await getSessionClaims());
}

/** The sign-in session's id (from the verified token), or null when signed out. */
export async function currentSessionId(): Promise<string | null> {
  const claims = await getSessionClaims();
  return typeof claims?.session_id === "string" ? claims.session_id : null;
}

/** Requires an active, signed-in user who has already chosen their own password (and passed any second step that is on). */
export async function requireProfile(): Promise<Profile> {
  const profile = await loadSessionProfile();
  // A valid session with no profile row (account was removed) must be signed out,
  // otherwise /login and the app keep redirecting to each other.
  if (!profile) redirect("/auth/signout?reason=no_profile");
  if (!profile.is_active) redirect("/auth/signout?reason=inactive");
  // Password sign-in with a second step on (authenticator code or emailed code): that comes before anything else.
  const step = await secondStep(profile);
  if (step) redirect(secondStepPath(step));
  // Someone invited by email only also has to tell us who they are before they get in.
  if (!profile.password_changed || !profile.details_complete) redirect("/set-password");
  // Everyone must have accepted the CURRENT Data Privacy Notice (existing accounts are asked once).
  if (profile.privacy_accepted_version !== PRIVACY_VERSION) redirect("/accept-privacy");
  return profile;
}

/** Same as requireProfile but also keeps users inside their own role's area. */
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect(ROLE_HOME[profile.role]);
  return profile;
}

/** For server actions: the signed-in, active user if they hold one of the roles, else null. */
export async function getActor(...roles: Role[]): Promise<Profile | null> {
  const profile = await getSessionProfile();
  if (!profile || !profile.is_active || !roles.includes(profile.role)) return null;
  return profile;
}

/** The user's campus (null for the global Super Admin). */
export const getCampus = cache(async (campusId: string | null): Promise<Campus | null> => {
  if (!campusId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("campuses").select("*").eq("id", campusId).maybeSingle<Campus>();
  return data ?? null;
});
