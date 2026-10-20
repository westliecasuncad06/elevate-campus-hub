import type { SupabaseClient } from "@supabase/supabase-js";
import type { Program } from "@/lib/types";

/**
 * A campus's active programs, in the order the Super Admin set. Programs belong to one campus, and a campus with none
 * lets students type their course instead of picking from a list.
 */
export async function getActivePrograms(supabase: SupabaseClient, campusId: string | null): Promise<Program[]> {
  if (!campusId) return [];
  const { data } = await supabase
    .from("programs")
    .select("*")
    .eq("is_active", true)
    .eq("campus_id", campusId)
    .order("sort_order")
    .order("code");
  return (data ?? []) as Program[];
}

/** Active programs for every campus at once, grouped by campus id, for forms where the campus is picked inside the form. */
export async function getActiveProgramsByCampus(supabase: SupabaseClient): Promise<Record<string, Program[]>> {
  const { data } = await supabase
    .from("programs")
    .select("*")
    .eq("is_active", true)
    .not("campus_id", "is", null)
    .order("sort_order")
    .order("code");
  const byCampus: Record<string, Program[]> = {};
  for (const program of (data ?? []) as Program[]) {
    (byCampus[program.campus_id!] ??= []).push(program);
  }
  return byCampus;
}
