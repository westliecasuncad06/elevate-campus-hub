// Loads a campus's student names into its roster, from the attendance sheet (Google Sheets link or a CSV file).
//
//   npm run roster:import -- --campus GRC --url "https://docs.google.com/spreadsheets/d/.../edit?gid=123" [--dry-run]
//   npm run roster:import -- --campus GRC --file roster.csv [--dry-run]
//
// The sheet needs a "Name" column (the first column), and may have "Gender" and "Year Level / Course" columns. Date
// columns are not read. Names already on the roster are left alone (nothing is overwritten), so the script can be run
// again after the sheet grows. Students who already have an account with a matching name are linked straight away.
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local (it runs as the server does).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { nameKeyFor, parseRosterSheet } from "../src/lib/roster.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const dryRun = args.includes("--dry-run");

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function sheetCsvUrl(link) {
  const sheet = /\/spreadsheets\/d\/([\w-]+)/.exec(link);
  if (!sheet) fail("That doesn't look like a Google Sheets link.");
  const gid = /[#&?]gid=(\d+)/.exec(link)?.[1];
  return `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

const campusArg = option("campus");
const url = option("url");
const file = option("file");
if (!campusArg || (!url && !file)) {
  fail('Usage: npm run roster:import -- --campus GRC (--url "<sheet link>" | --file roster.csv) [--dry-run]');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
}

let csv;
if (file) {
  csv = readFileSync(file, "utf8");
} else {
  const res = await fetch(sheetCsvUrl(url), { redirect: "follow" });
  if (!res.ok || !/csv/i.test(res.headers.get("content-type") ?? "")) {
    fail(`Couldn't download the sheet (HTTP ${res.status}). Share it as "Anyone with the link can view", or save it as CSV and use --file.`);
  }
  csv = await res.text();
}

const parsed = parseRosterSheet(csv);
console.log(`Read ${parsed.rows.length} names from the sheet.`);
for (const d of parsed.duplicates) console.log(`  same name listed twice, kept "${d.kept}" and merged "${d.dropped}"`);
for (const s of parsed.skipped) console.log(`  skipped (line ${s.line}): ${s.reason}`);
if (parsed.rows.length === 0) fail("No names found. Nothing to import.");

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

const { data: existing, error: existingError } = await db.from("roster_students").select("name_key").eq("campus_id", campus.id);
if (existingError) fail(`Couldn't read the roster: ${existingError.message}`);
const have = new Set((existing ?? []).map((r) => r.name_key));
const fresh = parsed.rows.filter((r) => !have.has(r.nameKey));
console.log(`${fresh.length} new, ${parsed.rows.length - fresh.length} already on the roster.`);

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

// Link students who already have an account with a matching name.
const { data: roster } = await db.from("roster_students").select("id, name_key, claimed_by").eq("campus_id", campus.id);
const { data: students } = await db.from("profiles").select("id, first_name, last_name").eq("campus_id", campus.id).eq("role", "student");
const takenProfiles = new Set((roster ?? []).filter((r) => r.claimed_by).map((r) => r.claimed_by));
const waiting = new Map((roster ?? []).filter((r) => !r.claimed_by).map((r) => [r.name_key, r]));
let linked = 0;
for (const s of students ?? []) {
  if (takenProfiles.has(s.id)) continue;
  const entry = waiting.get(nameKeyFor(s.first_name, s.last_name));
  if (!entry) continue;
  waiting.delete(entry.name_key);
  linked++;
  if (!dryRun) {
    const { error } = await db.from("roster_students").update({ claimed_by: s.id, claimed_at: new Date().toISOString() }).eq("id", entry.id).is("claimed_by", null);
    if (error) fail(`Couldn't link ${s.first_name} ${s.last_name}: ${error.message}`);
  }
}
console.log(`${linked} existing student account(s) matched a roster name.`);
console.log(dryRun ? "\nDry run: nothing was written." : "\nDone.");
