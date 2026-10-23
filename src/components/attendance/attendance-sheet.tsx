"use client";

import { useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  DownloadIcon,
  MinusIcon,
  TableIcon,
  TriangleAlertIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { FormSelect, type Option } from "@/components/forms";
import { EmptyState, StatCard } from "@/components/page-header";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AT_RISK_STREAK,
  SORT_LABEL,
  STATUS_HINT,
  STATUS_LABEL,
  sortRows,
  summarize,
  toCsv,
  yearCourse,
  yearLabel,
  type CellState,
  type ConsistencyStatus,
  type SheetRow,
  type SortKey,
} from "@/lib/attendance-stats";
import { cn } from "@/lib/utils";

const ALL = "all";

const STATUS_STYLE: Record<ConsistencyStatus, string> = {
  consistent: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  regular: "bg-secondary text-secondary-foreground",
  occasional: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  rare: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  new: "border-border text-muted-foreground",
};

const CELL: Record<CellState, { label: string; className: string; icon: React.ReactNode }> = {
  attended: {
    label: "Attended",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    icon: <CheckIcon className="size-4" strokeWidth={3} />,
  },
  missed: {
    label: "Not attended",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
    icon: <XIcon className="size-4" strokeWidth={3} />,
  },
  before: {
    label: "Not registered yet",
    className: "text-muted-foreground/60",
    icon: <MinusIcon className="size-3.5" />,
  },
  pending: {
    label: "Today’s session is still open, not recorded yet",
    className: "text-muted-foreground/60",
    icon: <MinusIcon className="size-3.5" />,
  },
};

/** The legend groups the two "not counted" cells, which look the same. */
const LEGEND: { state: CellState; label: string }[] = [
  { state: "attended", label: "Attended" },
  { state: "missed", label: "Not attended" },
  {
    state: "before",
    label: "Not counted (before they registered, or today and not recorded yet)",
  },
];

/** "Oct 16" for a YYYY-MM-DD day. */
function shortDate(day: string): {
  short: string;
  weekday: string;
  full: string;
} {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(date);
  return {
    short: fmt({ month: "short", day: "numeric" }),
    weekday: fmt({ weekday: "short" }),
    full: fmt({
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  };
}

function download(filename: string, text: string) {
  // The BOM makes Excel read the file as UTF-8, so names with accents stay intact.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** The Campus Head's view of how consistently each student comes: one row per student, one column per day the campus met. */
export function AttendanceSheet({
  sessions,
  rows,
  facilitators,
  campusCode,
  from,
  to,
}: {
  sessions: string[];
  rows: SheetRow[];
  facilitators: Option[];
  campusCode: string;
  from: string;
  to: string;
}) {
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [facilitator, setFacilitator] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("name");
  // "dates": a tile per day the campus met (newest first) and who came that day. "table": the full grid.
  const [view, setView] = useState<"dates" | "table">("dates");
  // The day whose attendees are open in the pop-up (an index into `sessions`), or null when it is closed.
  const [selected, setSelected] = useState<number | null>(null);
  // Kept after closing so the pop-up's content doesn't vanish while it fades out.
  const [lastSelected, setLastSelected] = useState(Math.max(0, sessions.length - 1));

  // Whatever courses the students have: program codes at a campus with a list, typed courses at one without.
  const courses = useMemo<Option[]>(() => {
    const present = [...new Set(rows.map((r) => r.course).filter((c): c is string => Boolean(c)))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return present.map((c) => ({ value: c, label: c }));
  }, [rows]);

  const years = useMemo<Option[]>(() => {
    const present = [...new Set(rows.map((r) => r.yearLevel).filter((y): y is number => y !== null))].sort((a, b) => a - b);
    return [{ value: ALL, label: "All years" }, ...present.map((y) => ({ value: String(y), label: yearLabel(y) }))];
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (program !== ALL && r.course !== program) return false;
      if (year !== ALL && String(r.yearLevel) !== year) return false;
      if (facilitator === "none" ? r.facilitatorId !== null : facilitator !== ALL && r.facilitatorId !== facilitator)
        return false;
      if (status === "at-risk") return r.atRisk;
      if (status === "roster") return r.rosterOnly === true;
      if (status !== ALL && r.status !== status) return false;
      return true;
    });
    return sortRows(filtered, sort);
  }, [rows, query, program, year, facilitator, status, sort]);

  const summary = useMemo(() => summarize(visible, sessions.length), [visible, sessions.length]);
  const filtering = query !== "" || program !== ALL || year !== ALL || facilitator !== ALL || status !== ALL;

  const dates = useMemo(() => sessions.map(shortDate), [sessions]);
  // Most recent first, in the tiles and in the table's columns.
  const order = useMemo(() => sessions.map((_, i) => i).reverse(), [sessions]);
  // How many students came on each day (the whole campus, whatever the filters say).
  const attendedCount = useMemo(
    () => sessions.map((_, i) => rows.filter((r) => r.cells[i] === "attended").length),
    [sessions, rows],
  );
  const shown = selected ?? lastSelected;
  const attendees = useMemo(() => visible.filter((r) => r.cells[shown] === "attended"), [visible, shown]);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No sessions in this range"
        hint="A session is a day when at least one student was recorded. Pick a wider range, or run a batch first."
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Students"
          value={summary.students}
          hint={filtering ? "Matching your filters" : "Registered, plus names on your roster"}
        />
        <StatCard label="Sessions" value={summary.sessions} hint="Days the campus met" />
        <StatCard
          label="Average attendance"
          value={summary.averageRate === null ? "—" : `${summary.averageRate}%`}
          hint="Of the sessions each student could attend"
        />
        <StatCard label="Consistent" value={summary.consistent} hint="Attended 80% or more" />
        <StatCard label="At risk" value={summary.atRisk} hint={`Missed the last ${AT_RISK_STREAK}+ in a row`} />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="sheet-search">Search</Label>
          <Input id="sheet-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Student name" />
        </div>
        <FormSelect
          label="Course"
          name="program"
          defaultValue={ALL}
          options={[{ value: ALL, label: "All courses" }, ...courses]}
          onValueChange={setProgram}
          className="w-40"
        />
        <FormSelect label="Year" name="year" defaultValue={ALL} options={years} onValueChange={setYear} className="w-36" />
        <FormSelect
          label="Facilitator"
          name="facilitator"
          defaultValue={ALL}
          options={[{ value: ALL, label: "Everyone" }, { value: "none", label: "Not assigned" }, ...facilitators]}
          onValueChange={setFacilitator}
          className="w-48"
        />
        <FormSelect
          label="Show"
          name="status"
          defaultValue={ALL}
          options={[
            { value: ALL, label: "Everyone" },
            { value: "at-risk", label: "At risk" },
            { value: "roster", label: "No account yet" },
            ...(["consistent", "regular", "occasional", "rare", "new"] as const).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            })),
          ]}
          onValueChange={setStatus}
          className="w-40"
        />
        <FormSelect
          label="Sort by"
          name="sort"
          defaultValue="name"
          options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({
            value: k,
            label: SORT_LABEL[k],
          }))}
          onValueChange={(v) => setSort(v as SortKey)}
          className="w-52"
        />
        <Button
          type="button"
          variant="outline"
          disabled={visible.length === 0}
          onClick={() => download(`${campusCode}-attendance-${from}-to-${to}.csv`, toCsv(sessions, visible))}
        >
          <DownloadIcon />
          Export CSV
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="How to see the attendance"
        className="mb-4 grid w-full max-w-xs grid-cols-2 gap-1 rounded-2xl bg-muted p-1"
      >
        {(
          [
            { id: "dates", label: "Dates", icon: CalendarDaysIcon },
            { id: "table", label: "Table", icon: TableIcon },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              view === v.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <v.icon className="size-4" />
            {v.label}
          </button>
        ))}
      </div>

      {view === "dates" ? (
        <section aria-label="Attendance by date">
          <div className="-mx-1 mb-5 flex gap-3 overflow-x-auto px-1 pt-3 pb-3">
            {order.map((i, position) => {
              const d = dates[i];
              const [month, day] = d.short.split(" ");
              return (
                <button
                  key={sessions[i]}
                  type="button"
                  aria-haspopup="dialog"
                  title={`${d.full}: see who attended`}
                  onClick={() => {
                    setSelected(i);
                    setLastSelected(i);
                  }}
                  className="relative flex w-28 shrink-0 cursor-pointer flex-col items-center rounded-2xl border bg-card px-3 py-3 text-center transition-all outline-none hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {position === 0 ? (
                    <span className="absolute -top-2.5 rounded-full bg-brand/25 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-brand-ink uppercase">
                      Latest
                    </span>
                  ) : null}
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{d.weekday}</span>
                  <span className="text-4xl leading-tight font-bold tabular-nums">{day}</span>
                  <span className="text-sm font-medium text-muted-foreground">{month}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                    <UsersIcon className="size-3.5" />
                    {attendedCount[i]}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground">Click a date to see the students who attended.</p>

          <Dialog open={selected !== null} onOpenChange={(open) => (open ? null : setSelected(null))}>
            <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-xl">{dates[shown].full}</DialogTitle>
                <DialogDescription>
                  {attendees.length} {attendees.length === 1 ? "student" : "students"} attended
                  {filtering ? " (matching your filters)" : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="-mr-2 overflow-y-auto pr-2">
                {attendees.length === 0 ? (
                  <EmptyState
                    title={filtering ? "No one matches your filters on this day" : "No one was recorded on this day"}
                    hint={filtering ? "Clear a filter or change the search to see more." : undefined}
                  />
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {attendees.map((r) => (
                      <li key={r.id} className="rounded-xl border bg-card px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium">{r.name}</p>
                          <Badge
                            variant="outline"
                            className={cn("shrink-0 border-transparent", STATUS_STYLE[r.status])}
                            title={STATUS_HINT[r.status]}
                          >
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {yearCourse(r.yearLevel, r.course) || "—"}
                          {" · "}
                          {r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : "—"}
                          {r.facilitator ? ` · ${r.facilitator}` : ""}
                        </p>
                        {r.rosterOnly ? (
                          <Badge
                            variant="outline"
                            className="mt-1 border-transparent bg-brand/25 text-brand-ink"
                            title="On the roster, but has not registered yet."
                          >
                            No account yet
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </section>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.map(({ state, label }) => (
              <span key={state} className="inline-flex items-center gap-1.5">
                <span className={cn("grid size-5 place-items-center rounded-md", CELL[state].className)}>{CELL[state].icon}</span>
                {label}
              </span>
            ))}
            <span>Only days when at least one student was recorded count as sessions.</span>
          </p>

          {visible.length === 0 ? (
            <EmptyState title="No students match" hint="Clear a filter or change the search to see more." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-48 bg-card">Student</TableHead>
                    <TableHead className="hidden whitespace-nowrap sm:table-cell">Year / Course</TableHead>
                    {order.map((i) => (
                      <TableHead key={sessions[i]} className="px-1 text-center" title={dates[i].full}>
                        <span className="block whitespace-nowrap text-xs font-medium">{dates[i].short}</span>
                        <span className="block text-[0.65rem] font-normal text-muted-foreground">{dates[i].weekday}</span>
                      </TableHead>
                    ))}
                    <TableHead className="whitespace-nowrap text-right">Attended</TableHead>
                    <TableHead className="min-w-28 whitespace-nowrap">Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="whitespace-nowrap">Last attended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="sticky left-0 z-10 bg-card">
                        <p className="font-medium">{r.name}</p>
                        {r.rosterOnly ? (
                          <Badge
                            variant="outline"
                            className="mt-0.5 border-transparent bg-brand/25 text-brand-ink"
                            title="On the roster, but hasn't registered yet. Their attendance comes from your own sheet and moves to their account when they register."
                          >
                            No account yet
                          </Badge>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : "—"}
                          {r.facilitator ? ` · ${r.facilitator}` : ""}
                        </p>
                        {/* Phones: the Year / Course column is hidden to leave room for the dates, so it goes here. */}
                        <p className="text-xs text-muted-foreground sm:hidden">{yearCourse(r.yearLevel, r.course) || "—"}</p>
                        {r.atRisk ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
                            <TriangleAlertIcon className="size-3.5" />
                            Missed the last {r.missedStreak}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                        {yearCourse(r.yearLevel, r.course) || "—"}
                      </TableCell>
                      {order.map((i) => (
                        <TableCell key={sessions[i]} className="px-1 text-center">
                          <span
                            role="img"
                            aria-label={`${dates[i].full}: ${CELL[r.cells[i]].label}`}
                            title={`${dates[i].full}: ${CELL[r.cells[i]].label}`}
                            className={cn("mx-auto grid size-6 place-items-center rounded-md", CELL[r.cells[i]].className)}
                          >
                            {CELL[r.cells[i]].icon}
                          </span>
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {r.attended}/{r.eligible}
                      </TableCell>
                      <TableCell>
                        {r.rate === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
                              <div className="h-full rounded-full bg-foreground" style={{ width: `${r.rate}%` }} />
                            </div>
                            <span className="w-9 text-right tabular-nums">{r.rate}%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("border-transparent", STATUS_STYLE[r.status])}
                          title={STATUS_HINT[r.status]}
                        >
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.lastAttended ? shortDate(r.lastAttended).short : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <details className="mt-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How is consistency worked out?</summary>
        <ul className="mt-2 grid gap-1 pl-5">
          {(["consistent", "regular", "occasional", "rare", "new"] as const).map((s) => (
            <li key={s} className="list-disc">
              <strong className="text-foreground">{STATUS_LABEL[s]}</strong>: {STATUS_HINT[s]}.
            </li>
          ))}
          <li className="list-disc">
            <strong className="text-foreground">At risk</strong>: came before, but missed the last {AT_RISK_STREAK} or more
            sessions in a row.
          </li>
          <li className="list-disc">
            A student is only counted against sessions held after they were registered, so new students aren’t marked absent for
            earlier weeks.
          </li>
        </ul>
      </details>
    </>
  );
}
