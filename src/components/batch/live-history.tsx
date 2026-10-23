"use client";

import { useMemo, useState } from "react";
import { HandshakeIcon } from "lucide-react";
import { HistoryList } from "@/components/batch/history-list";
import { EmptyState } from "@/components/page-header";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Batch } from "@/lib/types";

/** "Sat", "24", "Oct" and the long form of a YYYY-MM-DD day. */
function dayParts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(date);
  return {
    weekday: fmt({ weekday: "short" }),
    day: String(d),
    month: fmt({ month: "short" }),
    full: fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  };
}

/**
 * Finished batches, a tile per day (newest first). Once a day is over its batches live here: click a day to see every
 * batch that was run, who each facilitator huddled with, and how each conversation went.
 */
export function LiveHistory({ batches, timezone, today }: { batches: Batch[]; timezone: string; today: string }) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Kept after closing so the pop-up's content doesn't vanish while it fades out.
  const [lastDay, setLastDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDay = new Map<string, Batch[]>();
    for (const b of batches) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b]);
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, list]) => ({
        day,
        list,
        students: list.reduce((n, b) => n + b.students.length, 0),
        engaged: list.reduce((n, b) => n + b.students.filter((s) => s.engagement?.isEngaged).length, 0),
      }));
  }, [batches]);

  if (days.length === 0) {
    return (
      <EmptyState
        title="No finished batches yet"
        hint="When a batch is finished it is saved here by day, with the students that were engaged."
      />
    );
  }

  const shownDay = openDay ?? lastDay;
  const shown = days.find((d) => d.day === shownDay);

  return (
    <>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-3 pb-3">
        {days.map((d) => {
          const p = dayParts(d.day);
          return (
            <button
              key={d.day}
              type="button"
              aria-haspopup="dialog"
              title={`${p.full}: see the batches`}
              onClick={() => {
                setOpenDay(d.day);
                setLastDay(d.day);
              }}
              className="relative flex w-32 shrink-0 cursor-pointer flex-col items-center rounded-2xl border bg-card px-3 py-3 text-center transition-all outline-none hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {d.day === today ? (
                <span className="absolute -top-2.5 rounded-full bg-brand/25 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-brand-ink uppercase">
                  Today
                </span>
              ) : null}
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{p.weekday}</span>
              <span className="text-4xl leading-tight font-bold tabular-nums">{p.day}</span>
              <span className="text-sm font-medium text-muted-foreground">{p.month}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                <HandshakeIcon className="size-3.5" />
                {d.list.length} {d.list.length === 1 ? "batch" : "batches"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{d.engaged} engaged</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">Click a day to see its batches. Older days are on the History page.</p>

      <Dialog open={openDay !== null} onOpenChange={(open) => (open ? null : setOpenDay(null))}>
        <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{shownDay ? dayParts(shownDay).full : ""}</DialogTitle>
            <DialogDescription>
              {shown
                ? `${shown.list.length} ${shown.list.length === 1 ? "batch" : "batches"} · ${shown.students} students huddled · ${shown.engaged} engaged`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="-mr-2 overflow-y-auto pr-2">
            {shown ? <HistoryList batches={shown.list} timezone={timezone} showFacilitator hideDates /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
