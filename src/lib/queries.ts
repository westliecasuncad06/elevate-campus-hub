import type { SupabaseClient } from "@supabase/supabase-js";
import type { Program } from "@/lib/types";

/** Active programs available to a campus: global ones (campus_id null) plus the campus's own. */
export async function getActivePrograms(supabase: SupabaseClient, campusId: string | null): Promise<Program[]> {
  let query = supabase.from("programs").select("*").eq("is_active", true).order("sort_order").order("code");
  if (campusId) query = query.or(`campus_id.is.null,campus_id.eq.${campusId}`);
  const { data } = await query;
  return (data ?? []) as Program[];
}
