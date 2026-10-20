/**
 * The campus roster: the names a campus already has on its attendance sheet, loaded before those students have an
 * account. When a student is registered with a name that matches a roster name, the two are linked.
 *
 * Pure functions with no imports (scripts load this file directly; see scripts/import-roster.mjs).
 */

export type RosterGender = "male" | "female";

export interface RosterRow {
  /** How the name is shown: "Irish Nicole Abordo". */
  fullName: string;
  /** What names are compared by: see nameKey(). */
  nameKey: string;
  gender: RosterGender | null;
  yearLevel: number | null;
  /** The course as written on the sheet ("BSBA"). */
  course: string | null;
}

/** Words that are not part of who someone is for matching purposes. */
const IGNORED_WORDS = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * The words of a name, lower-cased, without accents, punctuation, middle initials ("A.") or suffixes ("Jr."),
 * sorted and de-duplicated. "Gonzales, Ralph Lorenz A." and "Ralph Lorenz Gonzales" give the same words.
 */
export function nameWords(name: string): string[] {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !IGNORED_WORDS.has(word));
  return [...new Set(words)].sort();
}

/**
 * The value two names are compared by. The same person written "Last, First", "First Last", in capitals, with or
 * without a middle initial, gives the same key. Names are matched only when their keys are exactly equal.
 */
export function nameKey(name: string): string {
  return nameWords(name).join(" ");
}

/** A registration's first and last name as one name. */
export function nameKeyFor(firstName: string, lastName: string): string {
  return nameKey(`${firstName} ${lastName}`);
}

function titleCase(word: string): string {
  return word.toLowerCase().replace(/(^|[-'’.])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A name from the sheet, ready to show: "Abordo, Irish Nicole" becomes "Irish Nicole Abordo". */
export function displayName(sheetName: string): string {
  const cleaned = sheetName.trim().replace(/\s+/g, " ");
  const comma = cleaned.indexOf(",");
  const reordered =
    comma > 0 ? `${cleaned.slice(comma + 1).trim()} ${cleaned.slice(0, comma).trim()}`.trim() : cleaned;
  return reordered
    .split(" ")
    .map((word) => (word === word.toUpperCase() && /\p{L}{3,}/u.test(word) ? titleCase(word) : word))
    .join(" ");
}

export function parseGender(raw: string): RosterGender | null {
  const value = raw.trim().toLowerCase();
  return value === "male" || value === "female" ? value : null;
}

/** "2nd Year / BSBA" -> { yearLevel: 2, course: "BSBA" }. Either part can be missing. */
export function parseYearAndCourse(raw: string): { yearLevel: number | null; course: string | null } {
  const text = raw.trim();
  if (!text) return { yearLevel: null, course: null };
  const year = /(\d{1,2})\s*(?:st|nd|rd|th)?\s*year/i.exec(text);
  const slash = text.indexOf("/");
  const course = slash >= 0 ? text.slice(slash + 1).trim().replace(/\s+/g, " ") : "";
  return {
    yearLevel: year ? Number(year[1]) : null,
    course: course ? course.slice(0, 80) : null,
  };
}

/** Splits CSV text into rows of cells. Handles quoted cells that contain commas, quotes or line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------------
// Attendance from the sheet's colours: green = present, red = absent. The CSV export has no colours, so this reads the
// sheet's HTML export instead (Google Sheets → File → Download → Web page, or `export?format=zip`).
// ---------------------------------------------------------------------------------------------------------------------

export type Mark = "present" | "absent";

export interface HtmlCell {
  text: string;
  /** The cell's background as "#rrggbb", or "" when it has none. */
  bg: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** "#0f0" / "#00ff00" / "rgb(0, 255, 0)" -> "#00ff00" (lower-case), or "" if it isn't a colour. */
export function normalizeColour(value: string): string {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(v);
  if (rgb) {
    const hex = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return "";
}

/** Green means present and red means absent. Every other colour (white, grey header cells, yellow…) means nothing. */
export function markFromColour(colour: string): Mark | null {
  const hex = normalizeColour(colour);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (g >= 150 && g - r >= 40 && g - b >= 40) return "present";
  if (r >= 150 && r - g >= 40 && r - b >= 40) return "absent";
  return null;
}

/** Turns the first <table> of a Google Sheets HTML export into rows of cells (merged cells are repeated). */
export function parseSheetHtml(html: string): HtmlCell[][] {
  // .s12 { background-color: #00ff00 } -> class "s12" has that background.
  const bgByClass = new Map<string, string>();
  for (const rule of html.matchAll(/\.(s\d+)\s*\{([^}]*)\}/g)) {
    const bg = /background-color\s*:\s*([^;}]+)/.exec(rule[2]);
    if (bg) bgByClass.set(rule[1], normalizeColour(bg[1]));
  }

  const rows: HtmlCell[][] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: HtmlCell[] = [];
    // Only <td>: the grey row-number cells at the left of each row are <th>.
    for (const cellMatch of rowMatch[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)) {
      const attrs = cellMatch[1];
      const classes = (/class\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/);
      const inline = /style\s*=\s*"[^"]*background-color\s*:\s*([^;"]+)/.exec(attrs)?.[1];
      let bg = inline ? normalizeColour(inline) : "";
      if (!bg) for (const c of classes) if (bgByClass.get(c)) bg = bgByClass.get(c)!;
      const span = Math.min(Number(/colspan\s*=\s*"(\d+)"/.exec(attrs)?.[1] ?? 1) || 1, 100);
      const text = decodeEntities(cellMatch[2].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
      for (let i = 0; i < span; i++) cells.push({ text, bg });
    }
    rows.push(cells);
  }
  return rows;
}

/** "9/18/26" or "9/18/2026" -> "2026-09-18"; null when it isn't a date. */
export function sheetDateToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export interface PersonAttendance {
  name: string;
  nameKey: string;
  /** Only the days that are coloured green or red. */
  marks: Record<string, Mark>;
}

export interface SheetAttendance {
  /** The date columns found in the header, oldest first. */
  dates: string[];
  people: PersonAttendance[];
}

/**
 * Reads who was present (green) or absent (red) on each date column. Finds the header row ("Name" in the first
 * column, then dates), and reads every row below it. The same person listed twice becomes one: if either row is
 * green that day, they were present.
 */
export function parseSheetAttendance(html: string): SheetAttendance {
  const grid = parseSheetHtml(html);
  const headerAt = grid.findIndex((row) => (row[0]?.text ?? "").toLowerCase() === "name");
  if (headerAt < 0) return { dates: [], people: [] };

  const columns: { at: number; date: string }[] = [];
  grid[headerAt].forEach((cell, at) => {
    const date = sheetDateToIso(cell.text);
    if (date) columns.push({ at, date });
  });

  const byKey = new Map<string, PersonAttendance>();
  for (const row of grid.slice(headerAt + 1)) {
    const name = row[0]?.text ?? "";
    const key = nameKey(name);
    if (!name || nameWords(name).length < 2) continue;

    const person = byKey.get(key) ?? { name: displayName(name), nameKey: key, marks: {} };
    for (const { at, date } of columns) {
      const mark = markFromColour(row[at]?.bg ?? "");
      if (!mark) continue;
      // A green mark on either row of a doubled name wins.
      if (mark === "present" || !person.marks[date]) person.marks[date] = mark;
    }
    byKey.set(key, person);
  }
  return { dates: columns.map((c) => c.date).sort(), people: [...byKey.values()] };
}

export interface RosterImport {
  rows: RosterRow[];
  /** The same name listed twice: only the first is kept (the later one only fills in what was blank). */
  duplicates: { kept: string; dropped: string }[];
  /** Rows that were skipped, with the reason. */
  skipped: { line: number; reason: string }[];
}

/**
 * Reads the exported sheet: finds the header row ("Name", "Gender", "Year Level / Course", then the date columns) and
 * turns every row below it into a roster entry. The date columns are not read.
 */
export function parseRosterSheet(csv: string): RosterImport {
  const table = parseCsv(csv);
  const headerAt = table.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === "name");
  const result: RosterImport = { rows: [], duplicates: [], skipped: [] };
  if (headerAt < 0) {
    result.skipped.push({ line: 0, reason: 'No header row: the first column must be called "Name".' });
    return result;
  }
  const header = table[headerAt].map((c) => c.trim().toLowerCase());
  const genderAt = header.indexOf("gender");
  const courseAt = header.findIndex((c) => c.startsWith("year level"));

  const byKey = new Map<string, RosterRow>();
  for (let i = headerAt + 1; i < table.length; i++) {
    const cells = table[i];
    const raw = (cells[0] ?? "").trim();
    if (!raw) continue;

    const key = nameKey(raw);
    if (!key || nameWords(raw).length < 2) {
      result.skipped.push({ line: i + 1, reason: `"${raw}" needs at least a first and a last name` });
      continue;
    }
    const { yearLevel, course } = parseYearAndCourse(courseAt >= 0 ? (cells[courseAt] ?? "") : "");
    const row: RosterRow = {
      fullName: displayName(raw).slice(0, 160),
      nameKey: key,
      gender: genderAt >= 0 ? parseGender(cells[genderAt] ?? "") : null,
      yearLevel,
      course,
    };

    const existing = byKey.get(key);
    if (existing) {
      existing.gender ??= row.gender;
      existing.yearLevel ??= row.yearLevel;
      existing.course ??= row.course;
      result.duplicates.push({ kept: existing.fullName, dropped: row.fullName });
      continue;
    }
    byKey.set(key, row);
    result.rows.push(row);
  }
  return result;
}
