import type { Metadata } from "next";
import { HistoryFilters } from "@/components/batch/history-filters";
import { HistoryList } from "@/components/batch/history-list";
import { PageHeader } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { loadBatches } from "@/lib/batches";
import { todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { fullName, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "History" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysAgo(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function CampusHeadHistoryPage({ searchParams }: PageProps<"/campus-head/history">) {
  const profile = await requireRole("campus_head");
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
  const facilitator = typeof params.facilitator === "string" && params.facilitator !== "all" ? params.facilitator : undefined;

  const supabase = await createClient();
  const [batches, { data: people }] = await Promise.all([
    loadBatches(supabase, { facilitatorId: facilitator, status: "finished", from, to, limit: 150 }),
    // Facilitators and Campus Heads can both run batches.
    supabase.from("profiles").select("id, first_name, last_name, role").in("role", ["facilitator", "campus_head"]).order("first_name"),
  ]);
  const options = ((people ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "role">[]).map((p) => ({
    value: p.id,
    label: p.id === profile.id ? `${fullName(p)} (you)` : fullName(p),
  }));

  return (
    <>
      <PageHeader
        title="History"
        description="Every finished batch in your campus: who each facilitator huddled with and how it went."
      />
      <HistoryFilters from={from} to={to} max={today} facilitators={options} facilitator={facilitator} />
      <HistoryList batches={batches} timezone={timezone} showFacilitator />
    </>
  );
}
