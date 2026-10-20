import type { Metadata } from "next";
import { AvailabilityPage } from "@/components/availability/availability-page";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Availability" };

export default async function FacilitatorAvailability() {
  const profile = await requireRole("facilitator");
  return <AvailabilityPage profile={profile} />;
}
