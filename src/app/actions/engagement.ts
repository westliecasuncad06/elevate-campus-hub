"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export interface EngagementAnswers {
  isEngaged: boolean;
  heardGospel: boolean;
  acceptedJesus: boolean;
  wantsDgroup: boolean;
}

/**
 * Saves (or updates) the 4-question assessment for a student in one of your open batches.
 * The database function checks the batch is yours and still open, and stamps how long the engagement took.
 */
export async function saveEngagementAction(attendanceLogId: string, answers: EngagementAnswers): Promise<ActionResult> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return { ok: false, error: "Only a Campus Head or Facilitator can record engagement." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_engagement", {
    p_attendance_log_id: attendanceLogId,
    p_is_engaged: answers.isEngaged,
    p_heard_gospel: answers.heardGospel,
    p_accepted_jesus: answers.acceptedJesus,
    p_wants_dgroup: answers.wantsDgroup,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
