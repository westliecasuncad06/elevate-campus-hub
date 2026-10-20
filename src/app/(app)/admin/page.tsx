import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export const metadata: Metadata = { title: "Overview" };

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export default async function AdminHome() {
  await requireRole("super_admin");
  const supabase = await createClient();

  const countRole = async (role: Role) => {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", role);
    return count ?? 0;
  };

  const [campuses, heads, facilitators, students, pending, lastPing] = await Promise.all([
    supabase.from("campuses").select("id", { count: "exact", head: true }).eq("is_active", true),
    countRole("campus_head"),
    countRole("facilitator"),
    countRole("student"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("invitation_accepted_at", null)
      .eq("is_active", true),
    supabase
      .from("system_logs")
      .select("created_at, level")
      .eq("event", "keep_alive")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string; level: string }>(),
  ]);

  const ping = lastPing.data;
  const pingAgeDays = ping ? daysSince(ping.created_at) : null;
  const pingHealthy = pingAgeDays !== null && pingAgeDays <= 4 && ping?.level === "info";

  return (
    <>
      <PageHeader title="Overview" description="System-wide numbers at a glance." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Active campuses" value={campuses.count ?? 0} />
        <StatCard label="Campus heads" value={heads} />
        <StatCard label="Facilitators" value={facilitators} />
        <StatCard label="Students" value={students} />
        <StatCard label="Pending invitations" value={pending.count ?? 0} hint="Haven't set a password yet" />
      </div>

      <section className="mt-8 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Database keep-alive</h2>
            <p className="text-sm text-muted-foreground">
              Supabase pauses free projects after 7 quiet days. A scheduled job pings the database every 3 days.
            </p>
          </div>
          <Badge variant={pingHealthy ? "secondary" : "destructive"}>
            {ping ? (pingHealthy ? "Healthy" : "Check this") : "No ping yet"}
          </Badge>
        </div>
        <p className="mt-3 text-sm">
          {ping ? (
            <>
              Last ping: <span className="font-medium">{formatDateTime(ping.created_at)}</span>
            </>
          ) : (
            <>Nothing recorded yet. It starts once the app is deployed to Vercel (or call the keep-alive route manually).</>
          )}{" "}
          <Link href="/admin/logs" className="text-primary underline underline-offset-4">
            View system logs
          </Link>
        </p>
      </section>
    </>
  );
}
