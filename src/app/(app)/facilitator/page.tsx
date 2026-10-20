import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { TodayWorkspace } from "@/components/batch/today-workspace";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Today" };

export default async function FacilitatorHome({ searchParams }: PageProps<"/facilitator">) {
  const profile = await requireRole("facilitator");
  const params = await searchParams;
  const batch = typeof params.batch === "string" ? params.batch : null;

  return (
    <>
      <PageHeader title={`Hi, ${profile.first_name}`} description="Start a batch, add the students you're talking with, and record how each conversation went." />
      <TodayWorkspace profile={profile} basePath="/facilitator" requestedBatchId={batch} />
    </>
  );
}
