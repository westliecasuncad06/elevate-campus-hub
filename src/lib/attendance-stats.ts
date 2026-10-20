/**
 * How consistently each student attends, from the days the campus actually met.
 *
 * A "session" is a day on which at least one student was recorded. A student is only counted against sessions
 * that happened once they were registered (or that they attended anyway), so someone who joined last week isn't
 * marked absent for September. Today's session is still going, so it never counts against anyone.
 */

/** "pending" = today, and this student hasn't been recorded yet. */
export type CellState = "attended" | "missed" | "before" | "pending";
export type ConsistencyStatus = "new" | "consistent" | "regular" | "occasional" | "rare";

export const STATUS_LABEL: Record<ConsistencyStatus, string> = {
  new: "New",
  consistent: "Consistent",
  regular: "Regular",
  occasional: "Occasional",
  rare: "Rarely",
};

/** What each status means, in the same order the thresholds apply. */
export const STATUS_HINT: Record<ConsistencyStatus, string> = {
  new: "Fewer than 2 sessions since registering",
  consistent: "Attended 80% or more",
  regular: "Attended 50–79%",
  occasional: "Attended 20–49%",
  rare: "Attended under 20%",
};

/** Missed this many sessions in a row (after attending before) to count as "at risk". */
export const AT_RISK_STREAK = 3;

export interface StudentStats {
  cells: CellState[];
  attended: number;
  /** Sessions that counted for this student. */
  eligible: number;
  /** 0–100, or null when no session counted yet. */
  rate: number | null;
  status: ConsistencyStatus;
  /** Attended before, but missed the most recent sessions in a row. */
  atRisk: boolean;
  /** Sessions missed in a row, counting back from the latest. */
  missedStreak: number;
  lastAttended: string | null;
}

export function statusForRate(rate: number | null, eligible: number): ConsistencyStatus {
  if (rate === null || eligible < 2) return "new";
  if (rate >= 80) return "consistent";
  if (rate >= 50) return "regular";
  if (rate >= 20) return "occasional";
  return "rare";
}

/**
 * @param sessions      session dates, oldest first (YYYY-MM-DD)
 * @param registeredOn  the day the student was registered, in the campus's timezone (YYYY-MM-DD)
 * @param attendedDates the days this student was recorded
 * @param today         today in the campus's timezone; that session isn't over, so it can't count as missed
 */
export function computeStudentStats(
  sessions: string[],
  registeredOn: string,
  attendedDates: string[],
  today?: string,
): StudentStats {
  const attendedSet = new Set(attendedDates);

  const cells: CellState[] = sessions.map((day) => {
    if (attendedSet.has(day)) return "attended";
    if (day === today) return "pending";
    return day >= registeredOn ? "missed" : "before";
  });

  const attended = cells.filter((c) => c === "attended").length;
  const eligible = cells.filter((c) => c === "attended" || c === "missed").length;
  const rate = eligible === 0 ? null : Math.round((attended / eligible) * 100);

  // Misses in a row, counting back from the latest session that is over (or attended).
  let end = cells.length - 1;
  while (end >= 0 && cells[end] === "pending") end--;
  let missedStreak = 0;
  for (let i = end; i >= 0 && cells[i] === "missed"; i--) missedStreak++;

  const lastIndex = cells.lastIndexOf("attended");

  return {
    cells,
    attended,
    eligible,
    rate,
    status: statusForRate(rate, eligible),
    atRisk: attended > 0 && missedStreak >= AT_RISK_STREAK,
    missedStreak,
    lastAttended: lastIndex === -1 ? null : sessions[lastIndex],
  };
}

export interface SheetRow extends StudentStats {
  id: string;
  name: string;
  gender: "male" | "female" | null;
  /** Their program code, or the course they typed (campuses without a program list). */
  course: string | null;
  yearLevel: number | null;
  facilitatorId: string | null;
  facilitator: string | null;
  /** On the campus roster but without an account yet: their attendance comes from the campus's own sheet. */
  rosterOnly?: boolean;
}

export interface SheetSummary {
  students: number;
  sessions: number;
  /** Everyone's attended ÷ eligible, as a percentage. Null when nobody has an eligible session. */
  averageRate: number | null;
  consistent: number;
  atRisk: number;
}

export function summarize(rows: Pick<SheetRow, "attended" | "eligible" | "status" | "atRisk">[], sessionCount: number): SheetSummary {
  const attended = rows.reduce((sum, r) => sum + r.attended, 0);
  const eligible = rows.reduce((sum, r) => sum + r.eligible, 0);
  return {
    students: rows.length,
    sessions: sessionCount,
    averageRate: eligible === 0 ? null : Math.round((attended / eligible) * 100),
    consistent: rows.filter((r) => r.status === "consistent").length,
    atRisk: rows.filter((r) => r.atRisk).length,
  };
}

/** "2nd Year" — the label the ministry's attendance sheet uses. */
export function yearLabel(year: number | null): string {
  if (!year) return "";
  const rem100 = year % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[year % 10] ?? "th";
  return `${year}${suffix} Year`;
}

/** "2nd Year / BSBA", "BSBA", "2nd Year" or "" — the "Year Level / Course" column. */
export function yearCourse(year: number | null, course: string | null): string {
  return [yearLabel(year), course ?? ""].filter(Boolean).join(" / ");
}

export type SortKey = "name" | "rate-asc" | "rate-desc" | "recent";

export const SORT_LABEL: Record<SortKey, string> = {
  name: "Name (A–Z)",
  "rate-asc": "Least consistent first",
  "rate-desc": "Most consistent first",
  recent: "Attended most recently",
};

export function sortRows<T extends Pick<SheetRow, "name" | "rate" | "lastAttended">>(rows: T[], key: SortKey): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  // Students with no rate yet (brand new) go last in either consistency order.
  const rateAsc = (a: T, b: T) => (a.rate ?? 101) - (b.rate ?? 101) || byName(a, b);
  const rateDesc = (a: T, b: T) => (b.rate ?? -1) - (a.rate ?? -1) || byName(a, b);
  const recent = (a: T, b: T) => (b.lastAttended ?? "").localeCompare(a.lastAttended ?? "") || byName(a, b);
  const compare = { name: byName, "rate-asc": rateAsc, "rate-desc": rateDesc, recent }[key];
  return [...rows].sort(compare);
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // Quote anything with a comma, quote or line break; double up inner quotes. Also stop spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The sheet as CSV: Name, Gender, Year Level / Course, one column per session, then the totals. */
export function toCsv(sessions: string[], rows: SheetRow[]): string {
  const header = [
    "Name",
    "Gender",
    "Year Level / Course",
    "Facilitator",
    ...sessions,
    "Attended",
    "Sessions counted",
    "Rate %",
    "Status",
    "At risk",
    "Last attended",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : "",
        yearCourse(r.yearLevel, r.course),
        r.facilitator ?? "",
        // Blank = not counted (before they registered, or today and not recorded yet).
        ...r.cells.map((c) => (c === "attended" ? "Attended" : c === "missed" ? "Not attended" : "")),
        r.attended,
        r.eligible,
        r.rate,
        STATUS_LABEL[r.status],
        r.atRisk ? "Yes" : "",
        r.lastAttended ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
