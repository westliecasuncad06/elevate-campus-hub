import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { loadBatches } from "@/lib/batches";
import type { Batch } from "@/lib/types";

/** The signed-in person's open batches, oldest first (Batch 1, Batch 2, …). Cached per request. */
export const getMyOpenBatches = cache(async (profileId: string): Promise<Batch[]> => {
  const supabase = await createClient();
  const batches = await loadBatches(supabase, { facilitatorId: profileId, status: "open", limit: 20 });
  return batches.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
});

/** Which open batch Today should show: the one in the URL, otherwise the newest. */
export function pickBatch(batches: Batch[], requestedId?: string | null): Batch | null {
  if (batches.length === 0) return null;
  return batches.find((b) => b.id === requestedId) ?? batches[batches.length - 1];
}
