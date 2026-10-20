"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

/**
 * A student changes their own year level (everyone moves up a year). It is the only detail a student edits themselves:
 * anything else goes through their facilitator or Campus Head. Profile columns aren't writable through RLS, so this
 * uses the service role, after checking who is asking, and writes that one column for that one person.
 */
export async function updateMyYearLevelAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("student");
  if (!actor) return { ok: false, error: "You don't have permission to do that." };

  const year = Number(formData.get("year_level"));
  if (!Number.isInteger(year) || year < 1 || year > 6) return { ok: false, error: "Select your year level." };
  if (year === actor.year_level) return { ok: true, message: "Your year level is already saved." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ year_level: year }).eq("id", actor.id).eq("role", "student");
  if (error) return { ok: false, error: "Your year level could not be saved. Try again." };

  revalidatePath("/", "layout");
  return { ok: true, message: `Year level saved: Year ${year}.` };
}
