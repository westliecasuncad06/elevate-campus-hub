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
