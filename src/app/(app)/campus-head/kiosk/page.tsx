import type { Metadata } from "next";
import { Kiosk } from "@/components/kiosk/kiosk";
import { PageHeader } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { getActivePrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Check-in kiosk" };

export default async function KioskPage() {
  const profile = await requireRole("campus_head");
  const campus = await getCampus(profile.campus_id);
  const supabase = await createClient();
  const programs = await getActivePrograms(supabase, profile.campus_id);

  return (
    <>
      <PageHeader
        title="Check-in kiosk"
        description="Set this up on the laptop at the entrance and press Full screen. Students type their student number (or phone number) to mark their attendance."
      />
      <Kiosk programs={programs} campusName={campus?.name ?? "Elevate Campus Hub"} />
    </>
  );
}
