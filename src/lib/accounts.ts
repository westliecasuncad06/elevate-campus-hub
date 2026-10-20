import "server-only";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { placeholderName } from "@/lib/registration";
import { claimRosterName } from "@/lib/roster-claim";
import type { AccountFields } from "@/lib/validation";
import type { Profile, Role } from "@/lib/types";

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The public address invitation links should open: NEXT_PUBLIC_SITE_URL when it's set, otherwise the address this
 * very request came in on (so an app running on Vercel never builds links that point at localhost).
 */
export async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Not inside a request (a script): fall through.
  }
  return "http://localhost:3000";
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit")) {
    return "Supabase's email limit was reached. Wait a while, or connect a custom email (SMTP) provider in Supabase.";
  }
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return "An account with that email already exists.";
  }
  return message;
}

/**
 * Creates the auth user (sends the invitation email) and the matching profile row.
 * Rolls the auth user back if the profile can't be written.
 */
export async function createAccount(params: {
  role: Role;
  campusId: string | null;
  fields: AccountFields;
  createdBy: string;
}): Promise<Result<{ profileId: string; rosterMatch: string | null }>> {
  const { role, campusId, fields, createdBy } = params;
  const admin = createAdminClient();

  // Friendly duplicate checks first (the DB has unique indexes as the final guard).
  const { data: emailTaken } = await admin.from("profiles").select("id").ilike("email", fields.email).maybeSingle();
  if (emailTaken) return { ok: false, error: "Someone is already registered with that email." };

  if (fields.phone && campusId) {
    const { data: phoneTaken } = await admin
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("campus_id", campusId)
      .eq("phone", fields.phone)
      .maybeSingle();
    if (phoneTaken) {
      return {
        ok: false,
        error: `That phone number already belongs to ${phoneTaken.first_name} ${phoneTaken.last_name}.`,
      };
    }
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(fields.email, {
    redirectTo: `${await siteUrl()}/auth/confirm`,
    data: { first_name: fields.firstName, last_name: fields.lastName },
  });
  if (inviteError || !invited.user) {
    return { ok: false, error: friendlyAuthError(inviteError?.message ?? "Could not send the invitation.") };
  }
  const userId = invited.user.id;

  // The role goes into app_metadata (not editable by the user) so the proxy can read it from the JWT.
  const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role, campus_id: campusId },
  });
  if (metaError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: metaError.message };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    campus_id: campusId,
    role,
    first_name: fields.firstName,
    last_name: fields.lastName,
    email: fields.email,
    phone: fields.phone,
    gender: fields.gender,
    birthday: fields.birthday,
    church: fields.church,
    religion: fields.religion,
    program_id: fields.programId,
    course: fields.course,
    year_level: fields.yearLevel,
    student_number: fields.studentNumber,
    invitation_sent_at: new Date().toISOString(),
    created_by: createdBy,
    // Consent to the Data Privacy Notice was confirmed by whoever registered them (parseAccountForm requires it).
    data_consent_at: new Date().toISOString(),
    data_consent_version: PRIVACY_VERSION,
    data_consent_by: createdBy,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === "23505") {
      return { ok: false, error: "That email or phone number is already registered." };
    }
    return { ok: false, error: profileError.message };
  }

  // A student whose name is already on the campus roster is linked to that name.
  const rosterMatch =
    role === "student" && campusId ? await claimRosterName(admin, campusId, userId, fields.firstName, fields.lastName) : null;

  return { ok: true, profileId: userId, rosterMatch };
}

/**
 * Invites a Campus Head, facilitator or (Super Admin only) student with ONLY their email. They register themselves with
 * the 6-digit code in the email, and fill in their own name, gender and the rest then (`details_complete` stays false
 * until they do). A student's name is matched to the campus roster at that point.
 */
export async function inviteStaffByEmail(params: {
  role: "campus_head" | "facilitator" | "student";
  campusId: string;
  email: string;
  createdBy: string;
}): Promise<Result<{ profileId: string }>> {
  const { role, campusId, email, createdBy } = params;
  const admin = createAdminClient();

  // ilike without wildcards = case-insensitive exact match; escape the characters that act as wildcards.
  const { data: emailTaken } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();
  if (emailTaken) return { ok: false, error: "Someone is already registered with that email." };

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm`,
  });
  if (inviteError || !invited.user) {
    return { ok: false, error: friendlyAuthError(inviteError?.message ?? "Could not send the invitation.") };
  }
  const userId = invited.user.id;

  const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role, campus_id: campusId },
  });
  if (metaError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: metaError.message };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    campus_id: campusId,
    role,
    // Placeholders until they register: the person's own name replaces these.
    first_name: placeholderName(email),
    last_name: "",
    email,
    details_complete: false,
    invitation_sent_at: new Date().toISOString(),
    created_by: createdBy,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === "23505") return { ok: false, error: "That email is already registered." };
    return { ok: false, error: profileError.message };
  }

  return { ok: true, profileId: userId };
}

/** Re-sends the invitation email to someone who hasn't accepted yet. */
export async function resendInvitation(
  profile: Pick<Profile, "id" | "email" | "first_name" | "last_name" | "invitation_accepted_at" | "details_complete">,
): Promise<Result> {
  if (profile.invitation_accepted_at) {
    return { ok: false, error: "This person already accepted their invitation." };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo: `${await siteUrl()}/auth/confirm`,
    // Someone invited by email only has no real name yet, so the email says just "Welcome!".
    data: profile.details_complete ? { first_name: profile.first_name, last_name: profile.last_name } : undefined,
  });

  if (error) {
    // Supabase refuses to re-invite someone whose email is already confirmed. That happens when they
    // opened the first link but never finished choosing a password. Send a "set your password" email
    // instead (same landing page, same result).
    const alreadyConfirmed = /already|registered|exists/i.test(error.message);
    if (!alreadyConfirmed) return { ok: false, error: friendlyAuthError(error.message) };

    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: resetError } = await anon.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${await siteUrl()}/auth/confirm`,
    });
    if (resetError) return { ok: false, error: friendlyAuthError(resetError.message) };
  }

  await admin.from("profiles").update({ invitation_sent_at: new Date().toISOString() }).eq("id", profile.id);
  return { ok: true };
}

/** IT direct reset: no email involved. The person must choose their own password at next sign-in. */
export async function resetPasswordDirectly(profileId: string, newPassword: string): Promise<Result> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, {
    password: newPassword,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  const { error: profileError } = await admin.from("profiles").update({ password_changed: false }).eq("id", profileId);
  if (profileError) return { ok: false, error: profileError.message };
  return { ok: true };
}

/** Activates/deactivates a login. Deactivated users are also banned at the auth level. */
export async function setAccountActive(profileId: string, active: boolean): Promise<Result> {
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { ok: false, error: banError.message };

  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
