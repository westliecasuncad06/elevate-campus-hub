"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/dates";
import type { BatchStudent } from "@/lib/types";
import { EngagementDialog } from "@/components/engagement/engagement-dialog";

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{children}</span>;
}

/** The students in an open batch. Tapping one opens the engagement flow. */
export function StudentTiles({
  students,
  timezone,
  highlightPending,
}: {
  students: BatchStudent[];
  timezone: string;
  /** Draws attention to students still waiting for engagement (after a refused Finish). */
  highlightPending: boolean;
}) {
  const [selected, setSelected] = useState<BatchStudent | null>(null);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {students.map((s) => {
          const done = s.engagement !== null;
          return (
            <li key={s.logId}>
              <button
                type="button"
                onClick={() => setSelected(s)}
                className={cn(
                  "flex h-full w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  done && "border-primary/30",
                  !done && highlightPending && "border-brand ring-2 ring-brand/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{s.firstName}</p>
                    <p className="truncate text-sm text-muted-foreground">{s.lastName}</p>
                  </div>
                  {done ? (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
                      <CheckIcon className="size-4" />
                      <span className="sr-only">Recorded</span>
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-muted-foreground tabular-nums">Added {formatTime(s.addedAt, timezone)}</p>

                <div className="mt-auto flex min-h-6 flex-wrap gap-1.5">
                  {!done ? (
                    <span className="text-xs font-medium text-brand-ink">Tap to record engagement</span>
                  ) : !s.engagement!.isEngaged ? (
                    <span className="text-xs text-muted-foreground">Not engaged</span>
                  ) : (
                    <>
                      <Chip>Engaged</Chip>
                      {s.engagement!.heardGospel ? <Chip>Heard Gospel</Chip> : null}
                      {s.engagement!.acceptedJesus ? <Chip>Accepted Jesus</Chip> : null}
                      {s.engagement!.wantsDgroup ? <Chip>Wants D-Group</Chip> : null}
                    </>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <EngagementDialog student={selected} onClose={() => setSelected(null)} />
    </>
  );
}
