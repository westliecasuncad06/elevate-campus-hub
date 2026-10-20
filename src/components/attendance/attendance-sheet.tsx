"use client";

import { useMemo, useState } from "react";
import { CheckIcon, DownloadIcon, MinusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { FormSelect, type Option } from "@/components/forms";
import { EmptyState, StatCard } from "@/components/page-header";
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
  { state: "before", label: "Not counted (before they registered, or today and not recorded yet)" },
];

/** "Oct 16" for a YYYY-MM-DD day. */
function shortDate(day: string): { short: string; weekday: string; full: string } {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(date);
  return {
    short: fmt({ month: "short", day: "numeric" }),
    weekday: fmt({ weekday: "short" }),
    full: fmt({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
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
      if (facilitator === "none" ? r.facilitatorId !== null : facilitator !== ALL && r.facilitatorId !== facilitator) return false;
      if (status === "at-risk") return r.atRisk;
      if (status !== ALL && r.status !== status) return false;
      return true;
    });
    return sortRows(filtered, sort);
  }, [rows, query, program, year, facilitator, status, sort]);

  const summary = useMemo(() => summarize(visible, sessions.length), [visible, sessions.length]);
  const filtering = query !== "" || program !== ALL || year !== ALL || facilitator !== ALL || status !== ALL;

  const dates = useMemo(() => sessions.map(shortDate), [sessions]);

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
        <StatCard label="Students" value={summary.students} hint={filtering ? "Matching your filters" : "Active at your campus"} />
        <StatCard label="Sessions" value={summary.sessions} hint="Days the campus met" />
        <StatCard label="Average attendance" value={summary.averageRate === null ? "—" : `${summary.averageRate}%`} hint="Of the sessions each student could attend" />
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
            ...(["consistent", "regular", "occasional", "rare", "new"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
          onValueChange={setStatus}
          className="w-40"
        />
        <FormSelect
          label="Sort by"
          name="sort"
          defaultValue="name"
          options={(Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({ value: k, label: SORT_LABEL[k] }))}
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
                {dates.map((d, i) => (
                  <TableHead key={sessions[i]} className="px-1 text-center" title={d.full}>
                    <span className="block whitespace-nowrap text-xs font-medium">{d.short}</span>
                    <span className="block text-[0.65rem] font-normal text-muted-foreground">{d.weekday}</span>
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
                  {r.cells.map((cell, i) => (
                    <TableCell key={sessions[i]} className="px-1 text-center">
                      <span
                        role="img"
                        aria-label={`${dates[i].full}: ${CELL[cell].label}`}
                        title={`${dates[i].full}: ${CELL[cell].label}`}
                        className={cn("mx-auto grid size-6 place-items-center rounded-md", CELL[cell].className)}
                      >
                        {CELL[cell].icon}
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
                    <Badge variant="outline" className={cn("border-transparent", STATUS_STYLE[r.status])} title={STATUS_HINT[r.status]}>
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

      <details className="mt-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How is consistency worked out?</summary>
        <ul className="mt-2 grid gap-1 pl-5">
          {(["consistent", "regular", "occasional", "rare", "new"] as const).map((s) => (
            <li key={s} className="list-disc">
              <strong className="text-foreground">{STATUS_LABEL[s]}</strong>: {STATUS_HINT[s]}.
            </li>
          ))}
          <li className="list-disc">
            <strong className="text-foreground">At risk</strong>: came before, but missed the last {AT_RISK_STREAK} or more sessions in a row.
          </li>
          <li className="list-disc">
            A student is only counted against sessions held after they were registered, so new students aren’t marked absent for earlier weeks.
          </li>
        </ul>
      </details>
    </>
  );
}
