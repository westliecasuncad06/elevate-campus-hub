import type { Metadata } from "next";
import { HistoryFilters } from "@/components/batch/history-filters";
import { HistoryList } from "@/components/batch/history-list";
import { PageHeader } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { loadBatches } from "@/lib/batches";
import { todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "History" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysAgo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function FacilitatorHistoryPage({ searchParams }: PageProps<"/facilitator/history">) {
  const profile = await requireRole("facilitator");
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";
  const today = todayInTimezone(timezone);

  const params = await searchParams;
  const pick = (key: string, fallback: string) => {
    const v = params[key];
    return typeof v === "string" && DATE.test(v) ? v : fallback;
  };
  const from = pick("from", daysAgo(today, 14));
  const to = pick("to", today);

  const supabase = await createClient();
  const batches = await loadBatches(supabase, { facilitatorId: profile.id, endedBefore: today, status: "finished", from, to, limit: 100 });

  return (
    <>
      <PageHeader title="History" description="Your finished batches: who you huddled with and how each conversation went." />
      <HistoryFilters from={from} to={to} max={today} />
      <HistoryList batches={batches} timezone={timezone} showFacilitator={false} />
    </>
  );
}
