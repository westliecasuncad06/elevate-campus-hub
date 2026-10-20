// Offline database self-test: `npm run db:selftest`
// Runs supabase/setup.sql on an in-memory Postgres (PGlite) with Supabase-like stand-ins for the
// auth schema and roles, then exercises the RLS rules and functions by switching role + JWT subject.
// No Supabase project (or internet) needed. `npm run verify:rls` repeats the key checks on the real project.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const setupSql = readFileSync(fileURLToPath(new URL("../supabase/setup.sql", import.meta.url)), "utf8");
const db = new PGlite();

// --- Supabase stand-ins -----------------------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

// --- Apply the real migrations -------------------------------------------------------------
await db.exec(setupSql);
console.log("setup.sql applied OK\n");

// --- Helpers ----------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  ->  ${detail}` : ""}`); }
}

async function asUser(userId, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
async function tryQ(sql, params) {
  try { return { rows: await q(sql, params) }; } catch (e) { return { error: e.message }; }
}

const campus = await q("select id from public.campuses where code = 'GRC'");
const c1 = campus[0].id;
const [{ id: c2 }] = await q("insert into public.campuses (code, name) values ('TS2','Test 2') returning id");
check("seed: GRC campus exists and the 4 programs belong to it (none are global)", campus.length === 1 && (await q("select count(*)::int n from public.programs where campus_id = $1", [c1]))[0].n === 4 && (await q("select count(*)::int n from public.programs where campus_id is null"))[0].n === 0);

async function mkUser(key, role, campusId, gender) {
  const id = randomUUID();
  await q("insert into auth.users (id, email) values ($1, $2)", [id, `${key}@x.test`]);
  await q(
    `insert into public.profiles (id, campus_id, role, first_name, last_name, email, phone, gender, password_changed)
     values ($1,$2,$3,$4,'T',$5,$6,$7,true)`,
    [id, campusId, role, key, `${key}@x.test`, `09${Math.floor(Math.random() * 1e9)}`, gender],
  );
  return id;
}
const head1 = await mkUser("head1", "campus_head", c1, "male");
const head2 = await mkUser("head2", "campus_head", c2, "male");
const facM = await mkUser("facM", "facilitator", c1, "male");
const facF = await mkUser("facF", "facilitator", c1, "female");
const stuM = await mkUser("stuM", "student", c1, "male");
const stuF = await mkUser("stuF", "student", c1, "female");
const stuM2 = await mkUser("stuM2", "student", c1, "male");
const admin = await mkUser("admin", "super_admin", null, null);

check("trigger: students get a qr_token automatically", (await q("select qr_token from public.profiles where id = $1", [stuM]))[0].qr_token?.length === 36);
check("trigger: non-students get no qr_token", (await q("select qr_token from public.profiles where id = $1", [facM]))[0].qr_token === null);

const stuM3 = await mkUser("stuM3", "student", c1, "male");
const startBatch = (uid) => asUser(uid, () => tryQ("select public.start_batch() as r"));
const addTo = (uid, batch, student, method = "qr") => asUser(uid, () => tryQ("select public.add_student_to_batch($1::uuid, $2::uuid, $3) as r", [batch, student, method]));
const saveEng = (uid, log, eng, gos, acc, dg) => asUser(uid, () => tryQ("select public.save_engagement($1::uuid, $2, $3, $4, $5) as r", [log, eng, gos, acc, dg]));
const finish = (uid, batch) => asUser(uid, () => tryQ("select public.finish_batch($1::uuid) as r", [batch]));

console.log("\nBatches & attendance");
let r = await startBatch(facM);
const b1 = r.rows?.[0].r.id;
check("a facilitator can start batch 1", r.rows?.[0].r.batch_number === 1, r.error);
r = await startBatch(facM);
const b2 = r.rows?.[0].r.id;
check("a second batch gets number 2 (several can be open)", r.rows?.[0].r.batch_number === 2, r.error);
r = await startBatch(facF);
const bF = r.rows?.[0].r.id;
check("batch numbers are per facilitator", r.rows?.[0].r.batch_number === 1, r.error);
r = await startBatch(head1);
const bH = r.rows?.[0].r.id;
check("a campus head can start a batch too", r.rows?.[0].r.batch_number === 1, r.error);
check("a student cannot start a batch", !!(await startBatch(stuM)).error, "no error");

r = await addTo(facM, b1, stuM, "qr");
check("adding a student records attendance (time in) and assigns the facilitator", r.rows?.[0].r.action === "added" && r.rows[0].r.assigned_now === true && r.rows[0].r.facilitator_id === facM && r.rows[0].r.log.time_out === null, r.error);
r = await addTo(facM, b1, stuM, "qr");
check("adding the same student again changes nothing", r.rows?.[0].r.action === "already_in_batch", r.error);
check("only one attendance row for the day", (await q("select count(*)::int n from public.attendance_logs where student_id = $1", [stuM]))[0].n === 1);
r = await addTo(facF, bF, stuM, "qr");
check("a student already in someone's batch can't be added to another batch today", !!r.error && /already in/i.test(r.error) && /Batch 1/.test(r.error), r.error ?? "no error");
r = await addTo(facM, b2, stuM, "qr");
check("not even to the same facilitator's other batch", !!r.error, "no error");
r = await addTo(facM, b1, stuF, "phone");
check("a different-gender student is assigned but flagged", r.rows?.[0].r.assigned_now === true && r.rows[0].r.gender_mismatch === true, r.error);
r = await addTo(head1, bH, stuM2, "manual");
check("a campus head adding a student does NOT assign a facilitator", r.rows?.[0].r.action === "added" && r.rows[0].r.assigned_now === false && r.rows[0].r.facilitator_id === null, r.error);
r = await addTo(facF, b1, stuM3, "qr");
check("you can't add students to someone else's batch", !!r.error, "no error");
r = await addTo(head2, b1, stuM3, "qr");
check("another campus's head is rejected", !!r.error, "no error");
r = await addTo(stuM, b1, stuM3, "qr");
check("a student is rejected", !!r.error, "no error");
r = await addTo(facM, b2, stuM3, "bogus");
check("invalid entry method is rejected", !!r.error, "no error");
r = await addTo(facM, b2, stuM3, "email");
check("batch 2 gets its own student", r.rows?.[0].r.action === "added", r.error);

const todayManila = (await q("select (now() at time zone 'Asia/Manila')::date::text d"))[0].d;
check("log_date and batch_date use the campus timezone", (await q("select log_date::text d from public.attendance_logs where student_id = $1", [stuM]))[0].d === todayManila && (await q("select batch_date::text d from public.engagement_batches where id = $1", [b1]))[0].d === todayManila);

console.log("\nVisibility (RLS)");
check("other campus's head sees none of campus 1's profiles", (await asUser(head2, () => q("select id from public.profiles where campus_id = $1", [c1]))).length === 0);
check("a student sees only themselves among students", (await asUser(stuM, () => q("select id from public.profiles where role='student'"))).length === 1);
// A student must not read their facilitator's profile row (email, phone, birthday, church, ...); they get the name via my_facilitator()
check("a student cannot read their facilitator's profile row", (await asUser(stuM, () => q("select id from public.profiles where role='facilitator'"))).length === 0);
check("a student can't read the facilitator's email or phone by id either", (await asUser(stuM, () => q("select email, phone from public.profiles where id = $1", [facM]))).length === 0);
{
  const mine = await asUser(stuM, () => q("select * from public.my_facilitator()"));
  check("my_facilitator() tells a student who their facilitator is", mine.length === 1 && mine[0].id === facM && mine[0].first_name === "facM" && mine[0].gender === "male");
  check("...and returns only id, name and gender", mine.length === 1 && Object.keys(mine[0]).sort().join() === "first_name,gender,id,last_name");
  check("a student with no facilitator gets nobody", (await asUser(stuM2, () => q("select * from public.my_facilitator()"))).length === 0);
  check("a facilitator calling my_facilitator() gets nobody", (await asUser(facM, () => q("select * from public.my_facilitator()"))).length === 0);
  await db.exec("reset role; set role anon;");
  const anon = await tryQ("select * from public.my_facilitator()");
  await db.exec("reset role");
  check("anonymous users can't call my_facilitator()", !!anon.error);
}
check("a facilitator sees students but not other facilitators", (await asUser(facM, () => q("select role from public.profiles"))).every((p) => ["student", "facilitator"].includes(p.role)) && (await asUser(facM, () => q("select id from public.profiles where role='facilitator'"))).length === 1);
check("a student sees only their own attendance", (await asUser(stuM, () => q("select id from public.attendance_logs"))).length === 1);
r = await asUser(stuM, () => tryQ("insert into public.attendance_logs (campus_id, student_id, log_date, scanned_by, entry_method) values ($1,$2,'2000-01-01',$2,'manual')", [c1, stuM]));
check("a student cannot insert attendance directly", !!r.error, "no error");
r = await asUser(stuM, () => tryQ("update public.profiles set role = 'super_admin' where id = $1 returning id", [stuM]));
check("a student cannot change their own role", !!r.error || r.rows.length === 0, "row updated");
check("super admin can read everything", (await asUser(admin, () => q("select id from public.profiles"))).length === 9);
check("anonymous users see nothing", (await (async () => { await db.exec("reset role; set role anon;"); const x = await tryQ("select id from public.profiles"); await db.exec("reset role"); return x.rows ?? []; })()).length === 0);
check("a facilitator sees only their own batches", (await asUser(facM, () => q("select id from public.engagement_batches"))).length === 2 && (await asUser(facF, () => q("select id from public.engagement_batches"))).length === 1);
check("a campus head sees every batch in the campus", (await asUser(head1, () => q("select id from public.engagement_batches"))).length === 4);
check("another campus's head sees no batches", (await asUser(head2, () => q("select id from public.engagement_batches"))).length === 0);
check("a student sees no batches", (await asUser(stuM, () => q("select id from public.engagement_batches"))).length === 0 && (await asUser(stuM, () => q("select id from public.batch_students"))).length === 0);
check("a facilitator sees the students of their own batches only", (await asUser(facM, () => q("select id from public.batch_students"))).length === 3 && (await asUser(facF, () => q("select id from public.batch_students"))).length === 0);
r = await asUser(facM, () => tryQ("insert into public.engagement_batches (campus_id, facilitator_id, batch_date, batch_number) values ($1,$2,current_date,99)", [c1, facM]));
check("batches can't be created directly (only via start_batch)", !!r.error, "no error");
r = await asUser(facM, () => tryQ("insert into public.batch_students (batch_id, student_id, attendance_log_id, campus_id) select $1, student_id, id, campus_id from public.attendance_logs where student_id = $2", [b2, stuM2]));
check("batch members can't be added directly", !!r.error, "no error");

console.log("\nEngagement");
const logM = (await q("select id from public.attendance_logs where student_id = $1", [stuM]))[0].id;
const logF = (await q("select id from public.attendance_logs where student_id = $1", [stuF]))[0].id;
r = await saveEng(facM, logM, true, true, false, true);
check("the batch's facilitator can record engagement", !r.error, r.error);
const afterFirst = (await q("select time_out from public.attendance_logs where id = $1", [logM]))[0].time_out;
check("recording engagement ends the engaged-for timer (time_out set)", afterFirst !== null);
r = await saveEng(facM, logM, true, true, true, true);
check("it can be edited while the batch is open", !r.error, r.error);
check("editing does not move the time_out", String((await q("select time_out from public.attendance_logs where id = $1", [logM]))[0].time_out) === String(afterFirst));
r = await saveEng(facM, logF, false, true, true, true);
check("'No' to the first question skips and clears the rest", !r.error && (await q("select heard_gospel, accepted_jesus, wants_dgroup, is_engaged from public.engagement_logs where attendance_log_id = $1", [logF]))[0].heard_gospel === false, r.error);
check("another facilitator can't record engagement for this batch", !!(await saveEng(facF, logM, true, true, true, true)).error);
check("another campus can't", !!(await saveEng(head2, logM, true, true, true, true)).error);
check("a student can't", !!(await saveEng(stuM, logM, true, true, true, true)).error);
check("an unknown attendance record is rejected", !!(await saveEng(facM, randomUUID(), true, true, true, true)).error);
r = await asUser(facM, () => tryQ("insert into public.engagement_logs (attendance_log_id, student_id, facilitator_id, campus_id) values ($1,$2,$3,$4)", [logM, stuM, facM, c1]));
check("engagement can't be written directly", !!r.error, "no error");
check("a student cannot read engagement", (await asUser(stuM, () => q("select id from public.engagement_logs"))).length === 0);

console.log("\nFinishing batches");
r = await finish(facM, b2);
check("can't finish while a student has no engagement recorded", !!r.error && /1 more student/.test(r.error), r.error ?? "no error");
r = await startBatch(facM);
const b3 = r.rows?.[0].r.id;
r = await finish(facM, b3);
check("an empty batch is discarded instead of saved", r.rows?.[0].r.action === "discarded" && (await q("select count(*)::int n from public.engagement_batches where id = $1", [b3]))[0].n === 0, r.error);
check("only the owner can finish a batch", !!(await finish(facF, b1)).error);
r = await finish(facM, b1);
check("a complete batch finishes and moves to history", r.rows?.[0].r.action === "finished" && (await q("select status, finished_at is not null as done from public.engagement_batches where id = $1", [b1]))[0].done === true, r.error);
check("a finished batch can't be finished again", !!(await finish(facM, b1)).error);
check("a finished batch takes no more students", !!(await addTo(facM, b1, stuM3, "qr")).error);
check("a finished batch's engagement can't be changed", !!(await saveEng(facM, logM, true, false, false, false)).error);
r = await saveEng(facM, (await q("select id from public.attendance_logs where student_id = $1", [stuM3]))[0].id, true, true, false, false);
r = await finish(facM, b2);
check("batch 2 finishes once its student is recorded", r.rows?.[0].r.action === "finished", r.error);
r = await asUser(facM, () => tryQ("update public.engagement_batches set status = 'open', finished_at = null where id = $1 returning id", [b1]));
check("a finished batch can't be reopened by editing the table", !r.rows?.length, "row updated");

// Attendance sheet helpers (migration 0008): one row per student, plus the days the campus actually met
{
  const byStudent = await asUser(head1, () => q("select student_id, dates::text[] as dates from public.attendance_dates_by_student($1, $2::date, $2::date)", [c1, todayManila]));
  check("attendance_dates_by_student returns one row per student with their dates", byStudent.length === 4 && byStudent.every((r) => r.dates.length === 1 && r.dates[0] === todayManila), JSON.stringify(byStudent));
  const days = await asUser(head1, () => q("select * from public.attendance_session_dates($1, $2::date, $2::date)", [c1, todayManila]));
  check("attendance_session_dates returns the days the campus met", days.length === 1);
  check("another campus's head sees no attendance rows", (await asUser(head2, () => q("select * from public.attendance_dates_by_student($1, $2::date, $2::date)", [c1, todayManila]))).length === 0);
  check("a student sees only their own row", (await asUser(stuM, () => q("select student_id from public.attendance_dates_by_student($1, $2::date, $2::date)", [c1, todayManila]))).length === 1);
  const none = await q("select * from public.attendance_dates_by_student($1, '2000-01-01', '2000-01-02')", [c1]);
  check("an empty range returns nothing", none.length === 0);
}

// Saved Google Forms (migration 0009): the Campus Head of a campus manages that campus's forms, nobody else
{
  const url = "https://docs.google.com/forms/d/e/1FAIpQLSdSELFTESTSELFTEST/viewform";
  const add = await asUser(head1, () => tryQ("insert into public.campus_google_forms (campus_id, name, url, created_by) values ($1, 'Weekly report', $2, $3) returning id", [c1, url, head1]));
  check("a Campus Head can save a Google Form for their campus", !add.error && add.rows.length === 1, add.error);
  const formId = add.rows?.[0]?.id;

  const dupe = await asUser(head1, () => tryQ("insert into public.campus_google_forms (campus_id, name, url) values ($1, 'Same again', $2)", [c1, url]));
  check("the same form can't be saved twice for one campus", !!dupe.error);
  const notGoogle = await asUser(head1, () => tryQ("insert into public.campus_google_forms (campus_id, name, url) values ($1, 'Fake', 'https://example.com/forms/d/e/abc/viewform')", [c1]));
  check("only Google Form addresses can be saved", !!notGoogle.error);
  const noName = await asUser(head1, () => tryQ("insert into public.campus_google_forms (campus_id, name, url) values ($1, '   ', 'https://docs.google.com/forms/d/e/BLANKNAME/viewform')", [c1]));
  check("a form needs a name", !!noName.error);

  check("another campus's head can't save a form for this campus", !!(await asUser(head2, () => tryQ("insert into public.campus_google_forms (campus_id, name, url) values ($1, 'Sneaky', 'https://docs.google.com/forms/d/e/SNEAKY/viewform')", [c1]))).error);
  check("another campus's head can't see this campus's forms", (await asUser(head2, () => q("select id from public.campus_google_forms"))).length === 0);
  check("the Super Admin can see saved forms", (await asUser(admin, () => q("select id from public.campus_google_forms"))).length === 1);
  check("a facilitator can't see saved forms", (await asUser(facM, () => q("select id from public.campus_google_forms"))).length === 0);
  check("a student can't see saved forms", (await asUser(stuM, () => q("select id from public.campus_google_forms"))).length === 0);
  check("a facilitator can't save a form", !!(await asUser(facM, () => tryQ("insert into public.campus_google_forms (campus_id, name, url) values ($1, 'Nope', 'https://docs.google.com/forms/d/e/NOPE/viewform')", [c1]))).error);

  const other = await asUser(head2, () => tryQ("delete from public.campus_google_forms where id = $1 returning id", [formId]));
  check("another campus's head can't delete this campus's form", !other.error && other.rows.length === 0);
  const del = await asUser(head1, () => tryQ("delete from public.campus_google_forms where id = $1 returning id", [formId]));
  check("a Campus Head can remove their form", !del.error && del.rows.length === 1, del.error);
  check("campuses no longer have a single form link column", (await q("select 1 from information_schema.columns where table_schema = 'public' and table_name = 'campuses' and column_name = 'google_form_url'")).length === 0);
}

// Campus roster (migration 0015): names loaded before the students have accounts, read-only from the app
{
  console.log("\nRoster");
  const ins = (campus, name, key) => q("insert into public.roster_students (campus_id, full_name, name_key, gender, year_level, course) values ($1,$2,$3,'female',2,'BSBA') returning id", [campus, name, key]);
  const [{ id: rosterId }] = await ins(c1, "Aisa Doon", "aisa doon");
  await ins(c1, "Irish Nicole Abordo", "abordo irish nicole");
  await ins(c2, "Other Campus Student", "campus other student");

  const dupe = await tryQ("insert into public.roster_students (campus_id, full_name, name_key) values ($1,'Aisa  Doon','aisa doon')", [c1]);
  check("the same name can't be listed twice in one campus", !!dupe.error);
  check("...but another campus can list it", !(await tryQ("insert into public.roster_students (campus_id, full_name, name_key) values ($1,'Aisa Doon','aisa doon')", [c2])).error);

  check("a Campus Head sees only their own campus's roster", (await asUser(head1, () => q("select id from public.roster_students"))).length === 2);
  check("another campus's head sees only theirs", (await asUser(head2, () => q("select id from public.roster_students"))).length === 2);
  check("the Super Admin sees every roster", (await asUser(admin, () => q("select id from public.roster_students"))).length === 4);
  check("a facilitator sees the roster of the campus they work at", (await asUser(facM, () => q("select id from public.roster_students"))).length === 2);
  check("a student can't see the roster", (await asUser(stuM, () => q("select id from public.roster_students"))).length === 0);
  check("anonymous users can't read the roster", (await (async () => { await db.exec("reset role; set role anon;"); const x = await tryQ("select id from public.roster_students"); await db.exec("reset role"); return x.rows ?? []; })()).length === 0);

  for (const [who, label] of [[head1, "a Campus Head"], [facM, "a facilitator"], [stuM, "a student"], [admin, "the Super Admin (the app uses the service role instead)"]]) {
    const w = await asUser(who, () => tryQ("update public.roster_students set full_name = 'Changed' where id = $1 returning id", [rosterId]));
    const d = await asUser(who, () => tryQ("delete from public.roster_students where id = $1 returning id", [rosterId]));
    const i = await asUser(who, () => tryQ("insert into public.roster_students (campus_id, full_name, name_key) values ($1,'Sneaky Person','person sneaky')", [c1]));
    check(`${label} can't change the roster directly`, !!w.error && !!d.error && !!i.error, "a write was allowed");
  }

  // Linking: one account per roster name, and deleting the account frees the name
  // A throwaway student, so the other fixtures (and the numbers checked further down) are untouched.
  const claimer = await mkUser("rosterClaimer", "student", c1, "female");
  await q("update public.roster_students set claimed_by = $1, claimed_at = now() where id = $2", [claimer, rosterId]);
  const second = (await q("select id from public.roster_students where campus_id = $1 and name_key = 'abordo irish nicole'", [c1]))[0].id;
  check("an account can be linked to only one roster name", !!(await tryQ("update public.roster_students set claimed_by = $1 where id = $2", [claimer, second])).error);
  check("a linked name shows who it belongs to", (await q("select claimed_by from public.roster_students where id = $1", [rosterId]))[0].claimed_by === claimer);

  // Attendance kept on the roster (migration 0016): read-only from the app, and copied to the account when the name is linked
  const mark = (rid, date, status) => tryQ("insert into public.roster_attendance (roster_id, campus_id, log_date, status) values ($1,$2,$3,$4)", [rid, c1, date, status]);
  check("a roster mark can be saved", !(await mark(rosterId, "2026-09-18", "present")).error);
  await mark(rosterId, "2026-09-25", "present");
  await mark(rosterId, "2026-10-02", "absent");
  await mark(second, "2026-09-18", "present");
  check("one mark per name per day", !!(await mark(rosterId, "2026-09-18", "absent")).error);
  check("a mark is present or absent only", !!(await mark(rosterId, "2026-10-09", "late")).error);
  check("a Campus Head sees their campus's roster attendance", (await asUser(head1, () => q("select id from public.roster_attendance"))).length === 4);
  check("another campus's head sees none of it", (await asUser(head2, () => q("select id from public.roster_attendance"))).length === 0);
  check("the Super Admin sees it", (await asUser(admin, () => q("select id from public.roster_attendance"))).length === 4);
  check("a facilitator and a student can't see it", (await asUser(facM, () => q("select id from public.roster_attendance"))).length === 0 && (await asUser(stuM, () => q("select id from public.roster_attendance"))).length === 0);
  for (const [who, label] of [[head1, "a Campus Head"], [admin, "the Super Admin"], [stuM, "a student"]]) {
    const w = await asUser(who, () => tryQ("insert into public.roster_attendance (roster_id, campus_id, log_date, status) values ($1,$2,'2026-11-06','present')", [rosterId, c1]));
    const u = await asUser(who, () => tryQ("update public.roster_attendance set status = 'absent' where roster_id = $1 returning id", [rosterId]));
    const d = await asUser(who, () => tryQ("delete from public.roster_attendance where roster_id = $1 returning id", [rosterId]));
    check(`${label} can't change roster attendance directly`, !!w.error && !!u.error && !!d.error, "a write was allowed");
  }

  const copied = await q("select public.import_roster_attendance($1, $2) n", [rosterId, claimer]);
  check("linking copies only the PRESENT days into real attendance records", copied[0].n === 2 && (await q("select count(*)::int n from public.attendance_logs where student_id = $1", [claimer]))[0].n === 2, JSON.stringify(copied));
  const copiedRows = await q("select entry_method, scanned_by, (time_in at time zone 'Asia/Manila')::time::text t, log_date::text d from public.attendance_logs where student_id = $1 order by log_date", [claimer]);
  check("the copied records are marked as imports, at 9:00 campus time, on the sheet's dates", copiedRows.every((r) => r.entry_method === "import" && r.t === "09:00:00" && r.scanned_by === claimer) && copiedRows.map((r) => r.d).join() === "2026-09-18,2026-09-25", JSON.stringify(copiedRows));
  check("running it again adds nothing", (await q("select public.import_roster_attendance($1, $2) n", [rosterId, claimer]))[0].n === 0);
  check("it copies nothing for an account the name is NOT linked to", (await q("select public.import_roster_attendance($1, $2) n", [second, claimer]))[0].n === 0);
  check("a student can't call it", !!(await asUser(stuM, () => tryQ("select public.import_roster_attendance($1, $2)", [rosterId, stuM]))).error);
  check("a Campus Head can't call it", !!(await asUser(head1, () => tryQ("select public.import_roster_attendance($1, $2)", [rosterId, claimer]))).error);
  check("'import' is a valid way to be recorded, but a made-up one isn't", !(await tryQ("select 1 where 'import' in ('qr','phone','email','manual','import')")).error && !!(await tryQ("insert into public.attendance_logs (campus_id, student_id, log_date, scanned_by, entry_method) values ($1,$2,'2026-10-09',$2,'bogus')", [c1, claimer])).error);

  await q("delete from public.profiles where id = $1", [claimer]);
  check("deleting the linked account frees the roster name", (await q("select claimed_by from public.roster_students where id = $1", [rosterId]))[0].claimed_by === null);
}

const totals = (await asUser(head1, () => q("select * from public.compute_daily_report($1, $2::date)", [c1, todayManila])))[0];
// 4 students attended (stuM, stuF, stuM3 via facM; stuM2 via the Campus Head). stuM: engaged+gospel+accepted+dgroup,
// stuF: not engaged, stuM3: engaged+gospel. Volunteers = facilitators who added someone: only facM (a Campus Head doesn't count).
check("compute_daily_report: attendance=4 engaged=2 gospel=2 accepted=1 dgroup=1 volunteers=1",
  totals.total_attendance === 4 && totals.students_engaged === 2 && totals.students_heard_gospel === 2 &&
  totals.students_accepted_jesus === 1 && totals.students_wants_dgroup === 1 && totals.volunteers_count === 1, JSON.stringify(totals));

r = await asUser(facM, () => tryQ("insert into public.daily_reports (campus_id, report_date, submitted_by) values ($1, current_date, $2)", [c1, facM]));
check("a facilitator cannot write daily reports", !!r.error, "no error");
r = await asUser(head1, () => tryQ("insert into public.daily_reports (campus_id, report_date, total_attendance, submitted_by) values ($1,$2::date,3,$3) returning id", [c1, todayManila, head1]));
check("a campus head can write the daily report", !!r.rows?.length, r.error);
const reportId = r.rows?.[0]?.id;
await asUser(head1, () => q("update public.daily_reports set is_locked = true where id = $1", [reportId]));
r = await asUser(head1, () => tryQ("update public.daily_reports set total_attendance = 99 where id = $1", [reportId]));
check("a locked report cannot be edited", !!r.error, "no error");
r = await asUser(head1, () => tryQ("update public.daily_reports set is_locked = false where id = $1 returning id", [reportId]));
check("a locked report can be unlocked", !!r.rows?.length, r.error);
const rng = (await asUser(head1, () => q("select * from public.range_report_summary($1, $2::date, $2::date)", [c1, todayManila])))[0];
// Student figures come from the SAVED report (only total_attendance was saved above); volunteers are live.
check("range_report_summary sums saved reports + distinct live volunteers", rng.days_with_report === 1 && rng.total_attendance === 3 && rng.students_engaged === 0 && rng.volunteers_count === 1, JSON.stringify(rng));
check("other campus cannot read the report", (await asUser(head2, () => q("select id from public.daily_reports"))).length === 0);

console.log("\nSame-gender chat");
const send = (from, to, text, cid = c1) => asUser(from, () => tryQ("insert into public.chat_messages (sender_id, receiver_id, campus_id, message) values ($1,$2,$3,$4) returning id", [from, to, cid, text]));
// facM <-> stuM assigned & same gender; facM <-> stuF assigned but different gender; facF <-> stuM2 assigned & different gender
r = await send(facM, stuM, "hello");
check("facilitator -> assigned same-gender student: allowed", !!r.rows?.length, r.error);
const msgId = r.rows?.[0]?.id;
r = await send(stuM, facM, "hi");
check("student -> assigned same-gender facilitator: allowed", !!r.rows?.length, r.error);
check("male facilitator -> assigned female student: blocked", !!(await send(facM, stuF, "x")).error);
check("female student -> male facilitator: blocked", !!(await send(stuF, facM, "x")).error);
check("student -> unassigned facilitator: blocked", !!(await send(stuM, facF, "x")).error);
check("facilitator -> student assigned to someone else: blocked", !!(await send(facM, stuM2, "x")).error);
check("cannot send as someone else", !!(await asUser(stuM, () => tryQ("insert into public.chat_messages (sender_id, receiver_id, campus_id, message) values ($1,$2,$3,'spoof')", [facM, stuM, c1]))).error);
check("empty message is rejected", !!(await send(facM, stuM, "")).error);
check("unrelated student cannot read the conversation", (await asUser(stuF, () => q("select id from public.chat_messages"))).length === 0);
check("participants can read it", (await asUser(stuM, () => q("select id from public.chat_messages"))).length === 2);
r = await asUser(stuM, () => tryQ("update public.chat_messages set message = 'edited' where id = $1", [msgId]));
check("receiver cannot edit message text", !!r.error, "no error");
r = await asUser(stuM, () => tryQ("update public.chat_messages set is_read = true where id = $1 returning id", [msgId]));
check("receiver can mark as read", !!r.rows?.length, r.error);
r = await asUser(facM, () => tryQ("update public.chat_messages set is_read = true where id = $1 returning id", [msgId]));
check("sender cannot mark own message as read", !r.rows?.length, "updated");
r = await asUser(facM, () => tryQ("delete from public.chat_messages where id = $1", [msgId]));
check("nobody can delete messages", !!r.error, "no error");

console.log("\nReassignment");
r = await asUser(head1, () => tryQ("update public.facilitator_students set is_active = false where student_id = $1 and is_active", [stuF]));
check("campus head can deactivate an assignment", !r.error, r.error);
r = await asUser(head1, () => tryQ("insert into public.facilitator_students (facilitator_id, student_id, campus_id) values ($1,$2,$3)", [facF, stuF, c1]));
check("campus head can assign a new facilitator", !r.error, r.error);
r = await asUser(head1, () => tryQ("insert into public.facilitator_students (facilitator_id, student_id, campus_id) values ($1,$2,$3)", [facM, stuF, c1]));
check("a student can't have two active facilitators", !!r.error, "no error");
check("chat now works for the same-gender pair", !!(await send(facF, stuF, "welcome")).rows?.length);
r = await asUser(facM, () => tryQ("insert into public.facilitator_students (facilitator_id, student_id, campus_id) values ($1,$2,$3)", [facM, stuM2, c1]));
check("a facilitator cannot assign students", !!r.error, "no error");

console.log("\nNotifications");
const notesOf = (uid) => asUser(uid, () => q("select type, title, body, link, count, is_read from public.notifications order by created_at"));

const stuMNotes = await notesOf(stuM);
check("a student is told who their facilitator is (opens their card)", stuMNotes.some((n) => n.type === "assignment" && /is now your facilitator/.test(n.title) && n.link === "/student"));
check("a student is told when they're checked in (opens attendance)", stuMNotes.some((n) => n.type === "attendance" && n.link === "/student/attendance"));
check("a chat message notifies the receiver and opens the chat", stuMNotes.some((n) => n.type === "chat" && n.link === "/student/chat"));
const facMNotes = await notesOf(facM);
check("a facilitator's chat notification opens that student's thread", facMNotes.some((n) => n.type === "chat" && n.link === `/facilitator/chat?with=${stuM}`));
check("a facilitator isn't notified about students they added themselves", !facMNotes.some((n) => n.type === "assignment"));

const headNotes = await notesOf(head1);
check("Campus Head is told when a facilitator starts a batch (opens Live)", headNotes.some((n) => n.type === "batch" && /facM started Batch 1/.test(n.title) && n.link === "/campus-head/live"));
check("...and when they finish one (opens History)", headNotes.some((n) => /facM finished Batch 1/.test(n.title) && n.link === "/campus-head/history" && /students? · \d+ engaged/.test(n.body)));
check("...but not about their own batches", !headNotes.some((n) => /^head1 /.test(n.title)));
check("Campus Head hears about 'accepted Jesus' and D-Group interest", headNotes.some((n) => /accepted Jesus/.test(n.title)) && headNotes.some((n) => /wants to join a D-Group/.test(n.title)));
check("...and about a different-gender assignment (opens Students)", headNotes.some((n) => n.title === "Different-gender assignment" && n.link === "/campus-head/students"));
check("another campus's head hears none of it", (await notesOf(head2)).length === 0);

await send(facM, stuM, "second");
await send(facM, stuM, "third");
const chatRows = (await notesOf(stuM)).filter((n) => n.type === "chat" && !n.is_read);
check("repeated messages from one person collapse into ONE unread notification with a counter", chatRows.length === 1 && chatRows[0].count === 3 && chatRows[0].body === "third", JSON.stringify(chatRows));

check("reassigning tells the student and the new facilitator", (await notesOf(stuF)).some((n) => /is now your facilitator/.test(n.title)) && (await notesOf(facF)).some((n) => /was assigned to you/.test(n.title) && n.link === "/facilitator/students"));

await q("update public.profiles set invitation_accepted_at = now() where id = $1", [stuM2]);
check("Campus Head is told when a student accepts the invitation (opens Students)", (await notesOf(head1)).some((n) => n.type === "invitation" && n.link === "/campus-head/students"));

await q("insert into public.system_logs (event, level, detail) values ('report_failed', 'error', '{\"error\":\"boom\"}'::jsonb), ('keep_alive', 'info', null)");
const adminNotes = await notesOf(admin);
check("a system error notifies the Super Admin (opens the logs); info doesn't", adminNotes.length === 1 && adminNotes[0].type === "system" && adminNotes[0].link === "/admin/logs" && /report failed/.test(adminNotes[0].title), JSON.stringify(adminNotes));
await q("delete from public.system_logs");

check("people only see their own notifications", (await asUser(stuM, () => q("select id from public.notifications where recipient_id <> $1", [stuM]))).length === 0);
r = await asUser(stuM, () => tryQ("insert into public.notifications (recipient_id, type, title, link) values ($1, 'system', 'spam', '/student')", [stuM]));
check("nobody can create notifications from the app", !!r.error, "no error");
r = await asUser(stuM, () => tryQ("update public.notifications set title = 'edited' where recipient_id = $1", [stuM]));
check("a notification's text can't be edited", !!r.error, "no error");
r = await asUser(stuM, () => tryQ("update public.notifications set is_read = true where recipient_id = $1 and type = 'attendance' returning id", [stuM]));
check("but it can be marked as read", r.rows?.length === 1, r.error);
r = await asUser(stuM, () => tryQ("update public.notifications set is_read = true where recipient_id <> $1 returning id", [stuM]));
check("and you can't touch anyone else's", !r.rows?.length, "updated someone else's");
r = await asUser(stuM, () => tryQ("delete from public.notifications where recipient_id = $1", [stuM]));
check("notifications can't be deleted from the app", !!r.error, "no error");
r = await tryQ("insert into public.notifications (recipient_id, type, title, link) values ($1, 'system', 'x', 'https://evil.example')", [stuM]);
check("a link must be an app path, never a full URL", !!r.error, "no error");
r = await asUser(stuM, () => tryQ("select public.notify($1::uuid, 'system', 't', 'b', '/student')", [stuM]));
check("the notify() helper can't be called from the app", !!r.error, "no error");

console.log("\nAvailability, programs, logs");
r = await asUser(facM, () => tryQ("insert into public.facilitator_availability (facilitator_id, day_of_week, start_time, end_time) values ($1,2,'09:00','12:00')", [facM]));
check("facilitator can set their own availability", !r.error, r.error);
r = await asUser(facM, () => tryQ("insert into public.facilitator_availability (facilitator_id, day_of_week, start_time, end_time) values ($1,2,'09:00','12:00')", [facF]));
check("facilitator cannot set someone else's availability", !!r.error, "no error");
r = await asUser(facM, () => tryQ("insert into public.facilitator_availability (facilitator_id, day_of_week, start_time, end_time) values ($1,3,'12:00','09:00')", [facM]));
check("end time must be after start time", !!r.error, "no error");
check("campus head can read facilitators' availability", (await asUser(head1, () => q("select id from public.facilitator_availability"))).length === 1);
check("assigned student can read their facilitator's availability", (await asUser(stuM, () => q("select id from public.facilitator_availability"))).length === 1);
check("unassigned student cannot", (await asUser(stuM2, () => q("select id from public.facilitator_availability"))).length === 0);
check("campus head cannot create programs", !!(await asUser(head1, () => tryQ("insert into public.programs (code, name) values ('HACK','Hack')"))).error);
check("super admin can create programs", !(await asUser(admin, () => tryQ("insert into public.programs (code, name) values ('BSCpE','Computer Eng')"))).error);
check("duplicate program code (case-insensitive) is rejected", !!(await asUser(admin, () => tryQ("insert into public.programs (code, name) values ('bscpe','dup')"))).error);
check("a student reads their campus's programs (and any global one)", (await asUser(stuM, () => q("select id from public.programs"))).length === 5);
await q("insert into public.system_logs (event) values ('keep_alive')");
check("only super admin reads system logs", (await asUser(head1, () => q("select id from public.system_logs"))).length === 0 && (await asUser(admin, () => q("select id from public.system_logs"))).length === 1);
r = await asUser(head1, () => tryQ("update public.campuses set name = 'hacked' where id = $1 returning id", [c1]));
check("campus head cannot edit campuses", !r.rows?.length, "updated");
check("campus head sees only own campus", (await asUser(head1, () => q("select id from public.campuses"))).length === 1);
{
  const [{ phone }] = await q("select phone from public.profiles where id = $1", [stuM]);
  const dupId = randomUUID();
  await q("insert into auth.users (id, email) values ($1, 'dup@x.test')", [dupId]);
  const dup = await tryQ(
    "insert into public.profiles (id, campus_id, role, first_name, last_name, email, phone, gender) values ($1,$2,'student','D','D','dup@x.test',$3,'male')",
    [dupId, c1, phone],
  );
  check("duplicate phone in a campus is rejected", !!dup.error, "no error");
}

console.log("\nTyped courses and moving people (migrations 0011, 0012)");
{
  const stuOther = await mkUser("stuOther", "student", c2, "male");
  check("a student of another campus doesn't see GRC's programs (only global ones)", (await asUser(stuOther, () => q("select id from public.programs"))).length === 1);

  check("a student can have a typed course", !(await tryQ("update public.profiles set course = 'BS Nursing' where id = $1", [stuM3])).error);
  check("a blank course is rejected", !!(await tryQ("update public.profiles set course = '   ' where id = $1", [stuM3])).error);
  check("a course can't be longer than 80 characters", !!(await tryQ("update public.profiles set course = $1 where id = $2", ["x".repeat(81), stuM3])).error);
  await q("update public.profiles set course = null where id = $1", [stuM3]);

  const move = (u, role, campus) => tryQ("select public.admin_move_user($1::uuid, $2, $3::uuid) as r", [u, role, campus]);
  const mvF = await mkUser("mvF", "facilitator", c1, "female");
  const mvS = await mkUser("mvS", "student", c1, "female");
  await q("insert into public.facilitator_students (facilitator_id, student_id, campus_id) values ($1,$2,$3)", [mvF, mvS, c1]);

  let m = await move(mvF, "facilitator", c1);
  check("moving someone to where they already are changes nothing", m.rows?.[0].r.changed === false, m.error);

  m = await move(mvF, "facilitator", c2);
  check("a facilitator can be moved to another campus", m.rows?.[0].r.changed === true && (await q("select campus_id from public.profiles where id = $1", [mvF]))[0].campus_id === c2, m.error);
  check("...which ends their student assignments", m.rows?.[0].r.ended_assignments === 1 && (await q("select is_active from public.facilitator_students where facilitator_id = $1", [mvF]))[0].is_active === false);
  check("...and the student is left without a facilitator, not deleted", (await q("select id from public.profiles where id = $1", [mvS])).length === 1);

  m = await move(mvF, "campus_head", c2);
  check("a facilitator can become a Campus Head (of any campus)", m.rows?.[0].r.changed === true && (await q("select role from public.profiles where id = $1", [mvF]))[0].role === "campus_head", m.error);
  m = await move(mvF, "campus_head", c1);
  check("a Campus Head can be moved to another campus", (await q("select campus_id from public.profiles where id = $1", [mvF]))[0].campus_id === c1, m.error);

  check("a student can't become staff", !!(await move(mvS, "facilitator", c1)).error);
  check("staff can't become a student", !!(await move(mvF, "student", c1)).error);
  check("a Super Admin can't be moved or demoted", !!(await move(admin, "campus_head", c1)).error);
  check("an unknown role is refused", !!(await move(mvF, "super_admin", c1)).error);
  check("an unknown person is refused", !!(await move(randomUUID(), "facilitator", c1)).error);

  const [{ id: cOff }] = await q("insert into public.campuses (code, name, is_active) values ('OFF', 'Closed campus', false) returning id");
  check("moving to an inactive campus is refused", !!(await move(mvF, "campus_head", cOff)).error);

  const mvF2 = await mkUser("mvF2", "facilitator", c1, "male");
  const mvS2 = await mkUser("mvS2", "student", c1, "male");
  const open = await startBatch(mvF2);
  const openId = open.rows?.[0].r.id;
  m = await move(mvF2, "facilitator", c2);
  check("someone with an open batch can't be moved until it is finished", !!m.error && /open batch/.test(m.error), m.error ?? "no error");
  await addTo(mvF2, openId, mvS2, "qr");
  m = await move(mvS2, "student", c2);
  check("a student in an open batch can't be moved either", !!m.error && /still open/.test(m.error), m.error ?? "no error");
  check("...and the refused moves changed nothing", (await q("select campus_id from public.profiles where id in ($1, $2)", [mvF2, mvS2])).every((p) => p.campus_id === c1));

  for (const [who, uid] of [["a Campus Head", head1], ["a facilitator", facM], ["a student", stuM], ["the Super Admin", admin]]) {
    check(`${who} can't call admin_move_user from the app (only the server can)`, !!(await asUser(uid, () => move(mvF, "campus_head", c1))).error);
  }
  await db.exec("reset role; set role anon;");
  const anonMove = await move(mvF, "campus_head", c1);
  await db.exec("reset role");
  check("anonymous users can't call it either", !!anonMove.error);
}

console.log("\nFacilitators working at several campuses (migration 0013)");
{
  const move = (u, role, campus, extra = []) =>
    tryQ("select public.admin_move_user($1::uuid, $2, $3::uuid, $4::uuid[]) as r", [u, role, campus, extra]);
  const worksAt = async (u, campus) => (await q("select public.works_at($1::uuid, $2::uuid) as w", [u, campus]))[0].w;

  const [{ id: c3 }] = await q("insert into public.campuses (code, name) values ('TS3', 'Test 3') returning id");
  const [{ id: cOff2 }] = await q("insert into public.campuses (code, name, is_active) values ('OF2', 'Closed 2', false) returning id");
  const multi = await mkUser("multi", "facilitator", c1, "female");
  const multiS1 = await mkUser("multiS1", "student", c1, "female"); // at c1
  const multiS2 = await mkUser("multiS2", "student", c2, "female"); // at c2
  const multiS3 = await mkUser("multiS3", "student", c2, "female"); // at c2, NOT assigned to multi

  // 1. Adding a campus
  let m = await move(multi, "facilitator", c1, [c2]);
  check("the Super Admin can add a campus to a facilitator", m.rows?.[0].r.changed === true && m.rows[0].r.ended_assignments === 0, m.error);
  check("...they still work at their current campus (nothing is switched by adding)", (await q("select campus_id from public.profiles where id = $1", [multi]))[0].campus_id === c1);
  check("works_at: current campus, an added campus, and a campus they don't work at", (await worksAt(multi, c1)) && (await worksAt(multi, c2)) && !(await worksAt(multi, c3)));
  m = await move(multi, "facilitator", c1, [c2]);
  check("saving the same campuses again changes nothing", m.rows?.[0].r.changed === false, m.error);
  m = await move(multi, "facilitator", c1, [c1, c2, c2]);
  check("the current campus and repeats in the list are ignored", m.rows?.[0].r.changed === false, m.error);

  await q("insert into public.facilitator_students (facilitator_id, student_id, campus_id) values ($1,$2,$3), ($1,$4,$5)", [multi, multiS1, c1, multiS2, c2]);

  // 2. Who can see what
  check("a Campus Head sees a facilitator who works at their campus (though set to another)", (await asUser(head2, () => q("select id from public.profiles where id = $1", [multi]))).length === 1);
  check("a facilitator doesn't see other facilitators", (await asUser(facM, () => q("select id from public.profiles where id = $1", [multi]))).length === 0);
  check("the extra-campus list is visible to its own campus's Campus Head, the person and the Super Admin only",
    (await asUser(head2, () => q("select * from public.profile_campuses"))).length === 1
    && (await asUser(head1, () => q("select * from public.profile_campuses"))).length === 0
    && (await asUser(multi, () => q("select * from public.profile_campuses"))).length === 1
    && (await asUser(stuM, () => q("select * from public.profile_campuses"))).length === 0
    && (await asUser(admin, () => q("select * from public.profile_campuses"))).length >= 1);
  check("nobody can edit the list from the app", !!(await asUser(head2, () => tryQ("insert into public.profile_campuses (profile_id, campus_id) values ($1, $2)", [multi, c3]))).error
    && !!(await asUser(multi, () => tryQ("delete from public.profile_campuses where profile_id = $1", [multi]))).error);

  await asUser(multi, () => q("insert into public.facilitator_availability (facilitator_id, day_of_week, start_time, end_time) values ($1, 4, '09:00', '12:00')", [multi]));
  check("both campuses' Campus Heads see the facilitator's availability", (await asUser(head2, () => q("select id from public.facilitator_availability where facilitator_id = $1", [multi]))).length === 1
    && (await asUser(head1, () => q("select id from public.facilitator_availability where facilitator_id = $1", [multi]))).length === 1);

  const seen = (await asUser(multi, () => q("select id from public.profiles where role = 'student'"))).map((p) => p.id);
  check("a facilitator sees the students assigned to them at every campus, and no others",
    seen.includes(multiS1) && seen.includes(multiS2) && !seen.includes(multiS3), JSON.stringify(seen));

  // 3. Chat works across the campuses they work at
  check("can_chat: a facilitator can chat with an assigned student at another campus they work at", (await q("select public.can_chat($1::uuid, $2::uuid) as c", [multi, multiS2]))[0].c === true);
  const hi = await asUser(multi, () => tryQ("insert into public.chat_messages (sender_id, receiver_id, campus_id, message) values ($1, $2, $3, 'hi from c1')", [multi, multiS2, c1]));
  check("...and send them a message", !hi.error, hi.error);
  const back = await asUser(multiS2, () => tryQ("insert into public.chat_messages (sender_id, receiver_id, campus_id, message) values ($1, $2, $3, 'hello')", [multiS2, multi, c2]));
  check("...and the student can reply", !back.error, back.error);

  // 4. Switching which campus they are working at
  check("my_campuses() lists the current campus first, then the others", JSON.stringify((await asUser(multi, () => q("select code, is_current from public.my_campuses()"))))
    === JSON.stringify([{ code: "GRC", is_current: true }, { code: "TS2", is_current: false }]));
  check("people who aren't facilitators get an empty list", (await asUser(head1, () => q("select * from public.my_campuses()"))).length === 0 && (await asUser(stuM, () => q("select * from public.my_campuses()"))).length === 0);

  m = await asUser(multi, () => tryQ("select public.switch_my_campus($1::uuid) as r", [c2]));
  check("a facilitator can switch to a campus they work at", m.rows?.[0].r.changed === true, m.error);
  check("...it becomes their current campus and the old one stays on their list",
    (await q("select campus_id from public.profiles where id = $1", [multi]))[0].campus_id === c2
    && (await worksAt(multi, c1)) && (await q("select count(*)::int n from public.profile_campuses where profile_id = $1 and campus_id = $2", [multi, c2]))[0].n === 0);
  check("...and their view follows: they now see campus 2's students", (await asUser(multi, () => q("select id from public.profiles where id = $1", [multiS3]))).length === 1);
  m = await asUser(multi, () => tryQ("select public.switch_my_campus($1::uuid) as r", [c1]));
  check("they can switch back", m.rows?.[0].r.changed === true && (await q("select campus_id from public.profiles where id = $1", [multi]))[0].campus_id === c1, m.error);
  m = await asUser(multi, () => tryQ("select public.switch_my_campus($1::uuid) as r", [c1]));
  check("switching to where they already are changes nothing", m.rows?.[0].r.changed === false, m.error);
  check("they can't switch to a campus they don't work at", !!(await asUser(multi, () => tryQ("select public.switch_my_campus($1::uuid)", [c3]))).error);
  check("only facilitators can switch", !!(await asUser(head1, () => tryQ("select public.switch_my_campus($1::uuid)", [c2]))).error && !!(await asUser(stuM, () => tryQ("select public.switch_my_campus($1::uuid)", [c2]))).error);
  await db.exec("reset role; set role anon;");
  const anonSwitch = await tryQ("select public.switch_my_campus($1::uuid)", [c2]);
  await db.exec("reset role");
  check("anonymous users can't switch", !!anonSwitch.error);

  // 5. Taking a campus away ends only that campus's assignments
  m = await move(multi, "facilitator", c1, []);
  check("removing a campus ends the assignments there (and only there)",
    m.rows?.[0].r.ended_assignments === 1
    && (await q("select is_active from public.facilitator_students where facilitator_id = $1 and student_id = $2", [multi, multiS2]))[0].is_active === false
    && (await q("select is_active from public.facilitator_students where facilitator_id = $1 and student_id = $2", [multi, multiS1]))[0].is_active === true, m.error);
  check("...they no longer work at it, and can't chat with that student", !(await worksAt(multi, c2)) && (await q("select public.can_chat($1::uuid, $2::uuid) as c", [multi, multiS2]))[0].c === false);
  check("...a Campus Head no longer sees them", (await asUser(head2, () => q("select id from public.profiles where id = $1", [multi]))).length === 0);

  // 6. Edge cases
  check("an inactive campus can't be added", !!(await move(multi, "facilitator", c1, [cOff2])).error);
  const chX = await mkUser("chX", "campus_head", c1, "male");
  m = await move(chX, "campus_head", c1, [c2]);
  check("a Campus Head stays at one campus (extra campuses are ignored)", m.rows?.[0].r.changed === false && (await q("select count(*)::int n from public.profile_campuses where profile_id = $1", [chX]))[0].n === 0, m.error);
  const multi2 = await mkUser("multi2", "facilitator", c1, "male");
  await move(multi2, "facilitator", c1, [c2, c3]);
  m = await move(multi2, "campus_head", c1, [c2, c3]);
  check("a facilitator who becomes a Campus Head loses the extra campuses", m.rows?.[0].r.changed === true && (await q("select count(*)::int n from public.profile_campuses where profile_id = $1", [multi2]))[0].n === 0, m.error);

  // 7. Open batches
  const openB = await startBatch(multi);
  check("a facilitator can have an open batch", !openB.error, openB.error);
  m = await move(multi, "facilitator", c1, [c2]);
  check("adding a campus is fine while a batch is open", m.rows?.[0].r.changed === true, m.error);
  m = await move(multi, "facilitator", c1, []);
  check("but taking one away needs the batch finished first", !!m.error && /open batch/.test(m.error), m.error ?? "no error");
  m = await asUser(multi, () => tryQ("select public.switch_my_campus($1::uuid) as r", [c2]));
  check("and so does switching campus yourself", !!m.error && /open batch/.test(m.error), m.error ?? "no error");
}

console.log("\nEmail-only invitations (migration 0014)");
{
  const addProfile = async (key, role, gender, complete) => {
    const id = randomUUID();
    await q("insert into auth.users (id, email) values ($1, $2)", [id, `${key}@x.test`]);
    return tryQ(
      "insert into public.profiles (id, campus_id, role, first_name, last_name, email, gender, details_complete) values ($1,$2,$3,$4,'',$5,$6,$7)",
      [id, c1, role, key, `${key}@x.test`, gender, complete],
    );
  };
  check("a facilitator invited by email only can exist before they have a gender", !(await addProfile("pendfac", "facilitator", null, false)).error);
  check("a Campus Head invited by email only can exist too", !(await addProfile("pendhead", "campus_head", null, false)).error);
  check("once their details are complete a facilitator must have a gender", !!(await addProfile("donefac", "facilitator", null, true)).error);
  check("...and so must a student", !!(await addProfile("donestu", "student", null, true)).error);
  check("details_complete is true unless said otherwise", (await q("select column_default from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'details_complete'"))[0].column_default === "true");

  const pendId = (await q("select id from public.profiles where email = 'pendfac@x.test'"))[0].id;
  check("registering sets the gender and completes the profile", !(await tryQ("update public.profiles set gender = 'female', details_complete = true where id = $1", [pendId])).error);
  check("a registered facilitator can't lose their gender again", !!(await tryQ("update public.profiles set gender = null where id = $1", [pendId])).error);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
