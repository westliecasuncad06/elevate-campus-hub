import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { AvailabilityEditor, type Slot } from "./availability-editor";

/** Shared by the Facilitator and Campus Head availability pages. */
export async function AvailabilityPage({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("facilitator_availability")
    .select("day_of_week, start_time, end_time")
    .eq("facilitator_id", profile.id)
    .eq("is_available", true);

  return (
    <>
      <PageHeader
        title="My availability"
        description="Tick the days you're free to meet students and set your hours. Your Campus Head and your students can see this."
      />
      <div className="max-w-2xl">
        <AvailabilityEditor slots={(data ?? []) as Slot[]} />
      </div>
    </>
  );
}
