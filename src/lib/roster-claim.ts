import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameKeyFor } from "@/lib/roster";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Links a newly registered student to the roster name that matches theirs (same campus, same words in any order and
 * case, middle initials ignored). Returns the roster name it linked to, or null when nothing matched.
 * Only exact matches are linked, so two different people are never mixed up; it never blocks a registration.
 * The days that name was marked present on the campus's sheet are copied into the student's attendance records.
 */
export async function claimRosterName(
  admin: Admin,
  campusId: string,
  profileId: string,
  firstName: string,
  lastName: string,
): Promise<string | null> {
  try {
    const key = nameKeyFor(firstName, lastName);
    if (!key) return null;

    const { data: entry } = await admin
      .from("roster_students")
      .select("id, full_name")
      .eq("campus_id", campusId)
      .eq("name_key", key)
      .is("claimed_by", null)
      .maybeSingle<{ id: string; full_name: string }>();
    if (!entry) return null;

    // `claimed_by is null` again so two registrations at once can't both take the same name.
    const { data: claimed, error } = await admin
      .from("roster_students")
      .update({ claimed_by: profileId, claimed_at: new Date().toISOString() })
      .eq("id", entry.id)
      .is("claimed_by", null)
      .select("id")
      .maybeSingle();
    if (error || !claimed) return null;

    // The attendance already recorded for this name on the campus's sheet becomes the student's own attendance.
    await admin.rpc("import_roster_attendance", { p_roster: entry.id, p_profile: profileId });
    return entry.full_name;
  } catch {
    return null;
  }
}
