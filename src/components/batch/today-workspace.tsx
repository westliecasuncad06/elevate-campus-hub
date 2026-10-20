import { getCampus } from "@/lib/auth";
import { todayInTimezone } from "@/lib/dates";
import { getMyOpenBatches, pickBatch } from "@/lib/my-batches";
import { getActivePrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { BatchTabs } from "./batch-tabs";
import { BatchWorkspace } from "./batch-workspace";
import { StartEngage } from "./start-engage";

/** The Today screen for a facilitator or Campus Head: start a batch, or work in the one that's open. */
export async function TodayWorkspace({
  profile,
  basePath,
  requestedBatchId,
}: {
  profile: Profile;
  basePath: string;
  requestedBatchId?: string | null;
}) {
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";
  const open = await getMyOpenBatches(profile.id);
  const selected = pickBatch(open, requestedBatchId);

  if (!selected) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("engagement_batches")
      .select("id", { count: "exact", head: true })
      .eq("facilitator_id", profile.id)
      .eq("status", "finished")
      .eq("batch_date", todayInTimezone(timezone));
    return <StartEngage basePath={basePath} finishedToday={count ?? 0} />;
  }

  const supabase = await createClient();
  const programs = await getActivePrograms(supabase, profile.campus_id);

  return (
    <>
      <BatchTabs
        basePath={basePath}
        selectedId={selected.id}
        batches={open.map((b) => ({
          id: b.id,
          number: b.number,
          pending: b.students.filter((s) => !s.engagement).length,
        }))}
      />
      <BatchWorkspace key={selected.id} batch={selected} programs={programs} timezone={timezone} basePath={basePath} />
    </>
  );
}
