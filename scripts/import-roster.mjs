// Loads a campus's student names AND their attendance into the roster, from the campus's own attendance sheet.
//
//   npm run roster:import -- --campus GRC --url "https://docs.google.com/spreadsheets/d/.../edit?gid=123" [--dry-run]
//   npm run roster:import -- --campus GRC --file roster.csv [--html sheet.html] [--dry-run]
//
// The sheet needs a "Name" column (the first column), and may have "Gender" and "Year Level / Course" columns. Each date
// column is read by its COLOUR: green = present, red = absent, anything else = not recorded (the CSV has no colours, so
// the attendance comes from the sheet's web-page export: the script downloads it for you when you give --url).
// Add --names-only to skip the attendance.
//
// Safe to run again after the sheet grows: names already on the roster are not overwritten, and a day that already has a
// mark is updated to the sheet's colour. Students who already have an account with a matching name are linked, and their
// green days become real attendance records. Needs SUPABASE_SERVICE_ROLE_KEY in .env.local (it runs as the server does).
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { nameKeyFor, parseRosterSheet, parseSheetAttendance } from "../src/lib/roster.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const namesOnly = args.includes("--names-only");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function sheetBase(link) {
  const sheet = /\/spreadsheets\/d\/([\w-]+)/.exec(link);
  if (!sheet) fail("That doesn't look like a Google Sheets link.");
  return { id: sheet[1], gid: /[#&?]gid=(\d+)/.exec(link)?.[1] };
}

/** The .html files inside a zip (Google's "export?format=zip" holds one per tab). Handles stored and deflated entries. */
function htmlFilesFromZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("The sheet download wasn't a zip file.");
  const entries = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const files = [];
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith(".html")) continue;

    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    const raw = buffer.subarray(dataAt, dataAt + compressedSize);
    files.push({ name, html: (method === 8 ? inflateRawSync(raw) : raw).toString("utf8") });
  }
  return files;
}

const campusArg = option("campus");
const url = option("url");
const file = option("file");
const htmlFile = option("html");
if (!campusArg || (!url && !file)) {
  fail('Usage: npm run roster:import -- --campus GRC (--url "<sheet link>" | --file roster.csv [--html sheet.html]) [--names-only] [--dry-run]');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
}

// --- Read the sheet ---------------------------------------------------------------------------------------------------
let csv;
let tabs = [];
if (file) {
  csv = readFileSync(file, "utf8");
  if (htmlFile && !namesOnly) tabs = [{ name: htmlFile, html: readFileSync(htmlFile, "utf8") }];
} else {
  const { id, gid } = sheetBase(url);
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`, { redirect: "follow" });
  if (!res.ok || !/csv/i.test(res.headers.get("content-type") ?? "")) {
    fail(`Couldn't download the sheet (HTTP ${res.status}). Share it as "Anyone with the link can view", or save it as CSV and use --file.`);
  }
  csv = await res.text();
  if (!namesOnly) {
    const zip = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=zip`, { redirect: "follow" });
    if (!zip.ok) fail(`Couldn't download the sheet's colours (HTTP ${zip.status}). Use --names-only to import just the names.`);
    tabs = htmlFilesFromZip(Buffer.from(await zip.arrayBuffer()));
  }
}

const parsed = parseRosterSheet(csv);
console.log(`Read ${parsed.rows.length} names from the sheet.`);
for (const d of parsed.duplicates) console.log(`  same name listed twice, kept "${d.kept}" and merged "${d.dropped}"`);
for (const s of parsed.skipped) console.log(`  skipped (line ${s.line}): ${s.reason}`);
if (parsed.rows.length === 0) fail("No names found. Nothing to import.");

// The tab that has the roster is the one with a "Name" header and date columns.
let attendance = null;
for (const tab of tabs) {
  const found = parseSheetAttendance(tab.html);
  if (found.dates.length > 0 && found.people.length > 0) {
    attendance = found;
    console.log(`Attendance: ${found.dates.length} date columns in "${tab.name}" (${found.dates.join(", ")}).`);
    break;
  }
}
if (!namesOnly && !attendance) console.log("No date columns with colours were found, so only the names are imported.");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: campuses, error: campusError } = await db
  .from("campuses")
  .select("id, code, name")
  .or(`code.ilike.${campusArg},name.ilike.${campusArg}`);
if (campusError) fail(`Couldn't look up the campus: ${campusError.message}`);
if (!campuses || campuses.length !== 1) fail(`Expected exactly one campus matching "${campusArg}", found ${campuses?.length ?? 0}.`);
const campus = campuses[0];
console.log(`Campus: ${campus.name} (${campus.code})`);

// --- Names ------------------------------------------------------------------------------------------------------------
const { data: existing, error: existingError } = await db.from("roster_students").select("name_key").eq("campus_id", campus.id);
if (existingError) fail(`Couldn't read the roster: ${existingError.message}`);
const have = new Set((existing ?? []).map((r) => r.name_key));
const fresh = parsed.rows.filter((r) => !have.has(r.nameKey));
console.log(`${fresh.length} new names, ${parsed.rows.length - fresh.length} already on the roster.`);

if (!dryRun && fresh.length > 0) {
  const { error } = await db.from("roster_students").insert(
    fresh.map((r) => ({
      campus_id: campus.id,
      full_name: r.fullName,
      name_key: r.nameKey,
      gender: r.gender,
      year_level: r.yearLevel,
      course: r.course,
    })),
  );
  if (error) fail(`Couldn't save the roster: ${error.message}`);
}

// --- Link students who already have an account with a matching name -----------------------------------------------------
const { data: roster } = await db.from("roster_students").select("id, name_key, claimed_by").eq("campus_id", campus.id);
const { data: students } = await db.from("profiles").select("id, first_name, last_name").eq("campus_id", campus.id).eq("role", "student");
const takenProfiles = new Set((roster ?? []).filter((r) => r.claimed_by).map((r) => r.claimed_by));
const waiting = new Map((roster ?? []).filter((r) => !r.claimed_by).map((r) => [r.name_key, r]));
const linkedNow = [];
for (const s of students ?? []) {
  if (takenProfiles.has(s.id)) continue;
  const entry = waiting.get(nameKeyFor(s.first_name, s.last_name));
  if (!entry) continue;
  waiting.delete(entry.name_key);
  linkedNow.push({ rosterId: entry.id, profileId: s.id });
  if (!dryRun) {
    const { error } = await db.from("roster_students").update({ claimed_by: s.id, claimed_at: new Date().toISOString() }).eq("id", entry.id).is("claimed_by", null);
    if (error) fail(`Couldn't link ${s.first_name} ${s.last_name}: ${error.message}`);
  }
}
console.log(`${linkedNow.length} existing student account(s) newly matched a roster name.`);

// --- Attendance -------------------------------------------------------------------------------------------------------
if (attendance) {
  const entries = new Map((roster ?? []).map((r) => [r.name_key, r]));
  // A dry run didn't save the new names, so count them as if it had.
  if (dryRun) for (const r of fresh) entries.set(r.nameKey, { id: `dry-run:${r.nameKey}`, name_key: r.nameKey });
  const claimedBy = new Map((roster ?? []).filter((r) => r.claimed_by).map((r) => [r.id, r.claimed_by]));
  for (const l of linkedNow) claimedBy.set(l.rosterId, l.profileId);

  const rows = [];
  const unmatched = [];
  const perDate = new Map(attendance.dates.map((d) => [d, { present: 0, absent: 0 }]));
  for (const person of attendance.people) {
    const entry = entries.get(person.nameKey);
    if (!entry) {
      unmatched.push(person.name);
      continue;
    }
    for (const [date, status] of Object.entries(person.marks)) {
      rows.push({ roster_id: entry.id, campus_id: campus.id, log_date: date, status });
      perDate.get(date)[status]++;
    }
  }
  for (const [date, n] of perDate) console.log(`  ${date}: ${n.present} present, ${n.absent} absent`);
  if (unmatched.length > 0) console.log(`  ${unmatched.length} name(s) in the attendance are not on the roster (removed?): ${unmatched.join(", ")}`);
  console.log(`${rows.length} attendance marks for ${new Set(rows.map((r) => r.roster_id)).size} people.`);

  if (!dryRun) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("roster_attendance").upsert(rows.slice(i, i + 500), { onConflict: "roster_id,log_date" });
      if (error) fail(`Couldn't save the attendance: ${error.message}`);
    }
    // Names that already belong to an account: their green days become real attendance records.
    let copied = 0;
    for (const [rosterId, profileId] of claimedBy) {
      const { data, error } = await db.rpc("import_roster_attendance", { p_roster: rosterId, p_profile: profileId });
      if (error) fail(`Couldn't copy attendance to an account: ${error.message}`);
      copied += data ?? 0;
    }
    if (claimedBy.size > 0) console.log(`${copied} day(s) copied into the attendance of ${claimedBy.size} registered student(s).`);
  }
}

console.log(dryRun ? "\nDry run: nothing was written." : "\nDone.");
