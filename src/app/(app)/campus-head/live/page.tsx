import type { Metadata } from "next";
import { CheckIcon } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState, PageHeader, StatCard } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { formatDuration, loadBatches, pendingCount } from "@/lib/batches";
import { formatTime, todayInTimezone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { fullName, type Batch, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Live" };

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{children}</span>;
}

function currentTimeIso(): string {
  return new Date().toISOString();
}

export default async function LivePage() {
  const profile = await requireRole("campus_head");
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";
  const today = todayInTimezone(timezone);

  const supabase = await createClient();
  const [open, finishedToday, { data: people }] = await Promise.all([
    loadBatches(supabase, { status: "open", limit: 100 }),
    loadBatches(supabase, { status: "finished", from: today, to: today, limit: 100 }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, role")
      .in("role", ["facilitator", "campus_head"])
      .eq("is_active", true)
      .order("first_name"),
  ]);

  const nowIso = currentTimeIso();
  const staff = (people ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "role">[];

  // Group the open batches by whoever is running them.
  const activeBy = new Map<string, Batch[]>();
  for (const b of open) activeBy.set(b.facilitatorId, [...(activeBy.get(b.facilitatorId) ?? []), b]);
  const activeStaff = staff.filter((s) => activeBy.has(s.id));
  const idleStaff = staff.filter((s) => !activeBy.has(s.id) && s.role === "facilitator");

  const studentsNow = open.reduce((n, b) => n + b.students.length, 0);
  const waiting = open.reduce((n, b) => n + pendingCount(b), 0);
  const finishedBy = new Map<string, number>();
  for (const b of finishedToday) finishedBy.set(b.facilitatorId, (finishedBy.get(b.facilitatorId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Live"
        description="Who is facilitating right now, and who they're with."
        actions={<AutoRefresh seconds={10} />}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Facilitating now" value={activeStaff.length} />
        <StatCard label="Open batches" value={open.length} />
        <StatCard label="Students being engaged" value={studentsNow} />
        <StatCard label="Still to record" value={waiting} hint="Students waiting for engagement" />
      </div>

      <section aria-labelledby="active-heading" className="mb-10">
        <h2 id="active-heading" className="mb-3 text-lg font-semibold">
          Active facilitators
        </h2>
        {activeStaff.length === 0 ? (
          <EmptyState
            title="No one is facilitating right now"
            hint="When a facilitator starts a batch, they and their students show up here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeStaff.map((person) => (
              <article key={person.id} className="rounded-2xl border bg-card p-4">
                <header className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">
                      {fullName(person)}
                      {person.role === "campus_head" ? <span className="font-normal text-muted-foreground"> (Campus Head)</span> : null}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Finished {finishedBy.get(person.id) ?? 0} {finishedBy.get(person.id) === 1 ? "batch" : "batches"} today
                    </p>
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                    Active
                  </span>
                </header>

                <div className="grid gap-4">
                  {activeBy.get(person.id)!.map((batch) => (
                    <div key={batch.id}>
                      <p className="mb-1.5 text-sm font-medium">
                        Batch {batch.number}
                        <span className="font-normal text-muted-foreground tabular-nums">
                          {" · "}started {formatTime(batch.startedAt, timezone)}
                          {" · "}
                          {formatDuration(batch.startedAt, nowIso)}
                        </span>
                      </p>
                      {batch.students.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No students added yet.</p>
                      ) : (
                        <ul className="grid gap-1.5">
                          {batch.students.map((s) => (
                            <li key={s.logId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                              <span className="font-medium">
                                {s.firstName} {s.lastName}
                              </span>
                              {!s.engagement ? (
                                <span className="text-xs font-medium text-brand-ink">Waiting</span>
                              ) : !s.engagement.isEngaged ? (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <CheckIcon className="size-3.5" /> Not engaged
                                </span>
                              ) : (
                                <span className="flex flex-wrap items-center gap-1">
                                  <CheckIcon className="size-3.5 text-success" />
                                  <Chip>Engaged</Chip>
                                  {s.engagement.heardGospel ? <Chip>Gospel</Chip> : null}
                                  {s.engagement.acceptedJesus ? <Chip>Accepted</Chip> : null}
                                  {s.engagement.wantsDgroup ? <Chip>D-Group</Chip> : null}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {idleStaff.length > 0 ? (
        <section aria-labelledby="idle-heading">
          <h2 id="idle-heading" className="mb-3 text-lg font-semibold">
            Not facilitating right now
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {idleStaff.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
                <span className="font-medium">{fullName(person)}</span>
                <span className="text-xs text-muted-foreground">
                  {finishedBy.get(person.id) ? `${finishedBy.get(person.id)} finished today` : "No batches today"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
