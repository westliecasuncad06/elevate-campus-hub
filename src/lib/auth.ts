import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * The profile of whoever's session this is, whether or not they have finished two-step verification yet.
 * Only the sign-in code step needs to see this; everything else uses getSessionProfile().
 */
export const loadSessionProfile = cache(async (): Promise<Profile | null> => {
  const claims = await getSessionClaims();
  const userId = claims?.sub;
  if (typeof userId !== "string") return null;

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  if (profile) return profile;

  // The database refuses a password-only session of someone who turned two-step on (that is the point), so their own
  // profile can't be read that way. The token is verified, so it is safe to look up WHO this is with the server's key;
  // what they may do next is still decided by the checks below.
  if (claims?.aal !== "aal2") {
    const { data } = await createAdminClient().from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
    return data ?? null;
  }
  return null;
});

/** Has this session done everything the account asks for to sign in: the second step when two-step is on? */
export async function mfaPending(profile: Pick<Profile, "mfa_enabled">): Promise<boolean> {
  if (!profile.mfa_enabled) return false;
  const claims = await getSessionClaims();
  // aal2 = passed the authenticator code. A Google sign-in is the "easy login" and isn't asked for it.
  return !(claims?.aal === "aal2" || signedInWithGoogle(claims));
}

/** The signed-in user's profile row, or null when signed out OR still waiting to enter their two-step code. */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const profile = await loadSessionProfile();
  if (!profile) return null;
  return (await mfaPending(profile)) ? null : profile;
});

/** Pages that work from a half-signed-in session (set password, privacy notice) send people to the code step first. */
export async function requireMfaStep(): Promise<void> {
  const profile = await loadSessionProfile();
  if (profile && (await mfaPending(profile))) redirect("/login/verify");
}

/** Whether the current session was started with "Continue with Google" (as opposed to a password or an email link). */
export async function isGoogleSession(): Promise<boolean> {
  return signedInWithGoogle(await getSessionClaims());
}

/** Requires an active, signed-in user who has already chosen their own password (and passed two-step if it is on). */
export async function requireProfile(): Promise<Profile> {
  const profile = await loadSessionProfile();
  // A valid session with no profile row (account was removed) must be signed out,
  // otherwise /login and the app keep redirecting to each other.
  if (!profile) redirect("/auth/signout?reason=no_profile");
  if (!profile.is_active) redirect("/auth/signout?reason=inactive");
  // Password sign-in with two-step on: the authenticator code comes before anything else.
  if (await mfaPending(profile)) redirect("/login/verify");
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
