import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import type { Campus, Profile, Role } from "@/lib/types";

/** The signed-in user's profile row (null when signed out). One DB read per request. */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<Profile>();
  return profile ?? null;
});

/** Requires an active, signed-in user who has already chosen their own password. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  // A valid session with no profile row (account was removed) must be signed out,
  // otherwise /login and the app keep redirecting to each other.
  if (!profile) redirect("/auth/signout?reason=no_profile");
  if (!profile.is_active) redirect("/auth/signout?reason=inactive");
  if (!profile.password_changed) redirect("/set-password");
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
