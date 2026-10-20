import type { SupabaseClient } from "@supabase/supabase-js";
import type { Gender } from "@/lib/types";

/** What a student is allowed to know about their facilitator: who they are, not how to reach them outside the app. */
export interface MyFacilitator {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender | null;
}

/**
 * The signed-in student's assigned facilitator, or null if they don't have one yet.
 * Goes through the `my_facilitator()` database function because students can't read the facilitator's profile row
 * (it holds email, phone, birthday and more). See migration 0010.
 */
export async function getMyFacilitator(supabase: SupabaseClient): Promise<MyFacilitator | null> {
  const { data } = await supabase.rpc("my_facilitator");
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as MyFacilitator | null;
}
