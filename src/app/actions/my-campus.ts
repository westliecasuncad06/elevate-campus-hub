"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A facilitator who works at several campuses picks which one they are at right now. The database function does the
 * checking (they must work there, and have no open batch) so it can't be got around by calling this with another id.
 */
export async function switchMyCampusAction(campusId: string): Promise<ActionResult> {
  const actor = await getActor("facilitator");
  if (!actor) return { ok: false, error: "Only facilitators can switch campus." };
  if (!UUID.test(campusId)) return { ok: false, error: "Pick one of your campuses." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("switch_my_campus", { p_campus: campusId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  const changed = Boolean((data as { changed?: boolean } | null)?.changed);
  return { ok: true, message: changed ? "Campus switched." : "You're already at that campus." };
}
