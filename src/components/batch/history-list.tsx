import { ChevronDownIcon } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { formatDate, formatTime } from "@/lib/dates";
import { formatDuration } from "@/lib/batches";
import type { Batch } from "@/lib/types";

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{children}</span>;
}

function totals(batch: Batch) {
  const eng = batch.students.map((s) => s.engagement);
  return {
    students: batch.students.length,
    engaged: eng.filter((e) => e?.isEngaged).length,
    gospel: eng.filter((e) => e?.heardGospel).length,
    accepted: eng.filter((e) => e?.acceptedJesus).length,
    dgroup: eng.filter((e) => e?.wantsDgroup).length,
  };
}

/** Finished batches grouped by day: who was huddled, what happened, and how long each engagement took. */
export function HistoryList({
  batches,
  timezone,
  showFacilitator,
  hideDates,
}: {
  batches: Batch[];
  timezone: string;
  showFacilitator: boolean;
  /** Leave out the day headings (when the day is already the title, as in the Live page's pop-up). */
  hideDates?: boolean;
}) {
  if (batches.length === 0) {
    return (
      <EmptyState
        title="No finished batches in this range"
        hint="When a batch is finished it's saved here, with the students you huddled and how each conversation went."
      />
    );
  }

  const byDate = new Map<string, Batch[]>();
  for (const b of batches) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);

  return (
    <div className="grid gap-8">
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} aria-label={formatDate(date)}>
          {hideDates ? null : <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{formatDate(date)}</h2>}
          <ul className="grid gap-3">
            {list.map((batch) => {
              const t = totals(batch);
              const duration = formatDuration(batch.startedAt, batch.finishedAt);
              return (
                <li key={batch.id}>
                  <details className="group rounded-2xl border bg-card open:shadow-sm">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 p-4 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          Batch {batch.number}
                          {showFacilitator ? <span className="font-normal text-muted-foreground"> · {batch.facilitatorName}</span> : null}
                        </p>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {formatTime(batch.startedAt, timezone)} – {formatTime(batch.finishedAt, timezone)}
                          {duration ? ` · ${duration}` : ""}
                        </p>
                      </div>
                      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <div className="flex gap-1.5"><dt className="text-muted-foreground">Students</dt><dd className="font-semibold tabular-nums">{t.students}</dd></div>
                        <div className="flex gap-1.5"><dt className="text-muted-foreground">Engaged</dt><dd className="font-semibold tabular-nums">{t.engaged}</dd></div>
                        <div className="flex gap-1.5"><dt className="text-muted-foreground">Gospel</dt><dd className="font-semibold tabular-nums">{t.gospel}</dd></div>
                        <div className="flex gap-1.5"><dt className="text-muted-foreground">Accepted</dt><dd className="font-semibold tabular-nums">{t.accepted}</dd></div>
                        <div className="flex gap-1.5"><dt className="text-muted-foreground">D-Group</dt><dd className="font-semibold tabular-nums">{t.dgroup}</dd></div>
                      </dl>
                      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>

                    <ul className="grid gap-px overflow-hidden rounded-b-2xl border-t bg-border">
                      {batch.students.map((s) => (
                        <li key={s.logId} className="flex flex-wrap items-center justify-between gap-2 bg-card px-4 py-3 last:rounded-b-2xl">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {s.firstName} {s.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              Added {formatTime(s.addedAt, timezone)}
                              {s.timeOut ? ` · engaged for ${formatDuration(s.addedAt, s.timeOut)}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {!s.engagement ? (
                              <span className="text-xs text-muted-foreground">Not recorded</span>
                            ) : !s.engagement.isEngaged ? (
                              <span className="text-xs text-muted-foreground">Not engaged</span>
                            ) : (
                              <>
                                <Chip>Engaged</Chip>
                                {s.engagement.heardGospel ? <Chip>Heard Gospel</Chip> : null}
                                {s.engagement.acceptedJesus ? <Chip>Accepted Jesus</Chip> : null}
                                {s.engagement.wantsDgroup ? <Chip>Wants D-Group</Chip> : null}
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
