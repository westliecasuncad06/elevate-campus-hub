import type { Metadata } from "next";
import { AvailabilityPage } from "@/components/availability/availability-page";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Availability" };

export default async function CampusHeadAvailability() {
  const profile = await requireRole("campus_head");
  return <AvailabilityPage profile={profile} />;
}
