"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Replaces the signed-in facilitator's (or Campus Head's) weekly availability with what's in the form. */
export async function saveAvailabilityAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("facilitator", "campus_head");
  if (!actor) return { ok: false, error: "You don't have permission to do that." };

  const rows: { facilitator_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean }[] = [];
  for (let day = 0; day < 7; day++) {
    if (formData.get(`available_${day}`) !== "on") continue;
    const start = String(formData.get(`start_${day}`) ?? "");
    const end = String(formData.get(`end_${day}`) ?? "");
    if (!TIME.test(start) || !TIME.test(end)) return { ok: false, error: "Enter a start and end time for each day you're available." };
    if (end <= start) return { ok: false, error: "The end time must be after the start time." };
    rows.push({ facilitator_id: actor.id, day_of_week: day, start_time: start, end_time: end, is_available: true });
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("facilitator_availability").delete().eq("facilitator_id", actor.id);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (rows.length) {
    const { error } = await supabase.from("facilitator_availability").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: rows.length ? "Availability saved." : "Availability cleared." };
}
