"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadBatches, pendingCount } from "@/lib/batches";
import type { ActionResult } from "@/lib/types";

const FORBIDDEN: ActionResult<never> = { ok: false, error: "Only a Campus Head or Facilitator can run a batch." };

/** Opens the next batch (Batch 1, Batch 2, …) for the signed-in facilitator or Campus Head. */
export async function startBatchAction(): Promise<ActionResult<{ id: string; number: number }>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return FORBIDDEN;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_batch");
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't start a batch." };

  const batch = data as { id: string; batch_number: number };
  revalidatePath("/", "layout");
  return { ok: true, data: { id: batch.id, number: batch.batch_number }, message: `Batch ${batch.batch_number} started.` };
}

/**
 * Finishes a batch and moves it to History. Refused (with who's missing) until every student in it
 * has their engagement recorded; an empty batch is just discarded.
 */
export async function finishBatchAction(batchId: string): Promise<ActionResult<{ discarded: boolean }>> {
  const actor = await getActor("campus_head", "facilitator");
  if (!actor) return FORBIDDEN;

  const supabase = await createClient();

  const [batch] = await loadBatches(supabase, { facilitatorId: actor.id, status: "open", limit: 50 }).then((all) =>
    all.filter((b) => b.id === batchId),
  );
  if (batch && pendingCount(batch) > 0) {
    const names = batch.students.filter((s) => !s.engagement).map((s) => s.firstName);
    return {
      ok: false,
      error: `Record engagement for ${names.join(", ")} before finishing Batch ${batch.number}.`,
    };
  }

  const { data, error } = await supabase.rpc("finish_batch", { p_batch_id: batchId });
  if (error) return { ok: false, error: error.message };

  const result = data as { action: "finished" | "discarded" };
  revalidatePath("/", "layout");
  return {
    ok: true,
    data: { discarded: result.action === "discarded" },
    message: result.action === "discarded" ? "Empty batch discarded." : "Batch finished and saved to History.",
  };
}
