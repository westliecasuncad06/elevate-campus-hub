"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

/**
 * Campus Head: take a name off the roster (for example a name listed twice, or someone who left). Only a name that
 * hasn't been linked to an account can be removed, and only from the Campus Head's own campus.
 */
export async function removeRosterNameAction(rosterId: string): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return { ok: false, error: "You don't have permission to do that." };

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("roster_students")
    .select("id, full_name, campus_id, claimed_by")
    .eq("id", rosterId)
    .maybeSingle<{ id: string; full_name: string; campus_id: string; claimed_by: string | null }>();
  if (!entry || entry.campus_id !== actor.campus_id) return { ok: false, error: "That name isn't on your roster." };
  if (entry.claimed_by) return { ok: false, error: "That student already has an account, so the name can't be removed." };

  const { error } = await admin.from("roster_students").delete().eq("id", rosterId).is("claimed_by", null);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/campus-head/roster");
  return { ok: true, message: `${entry.full_name} removed from the roster.` };
}
