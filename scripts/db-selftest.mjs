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
check("seed: GRC campus and 4 global programs exist", campus.length === 1 && (await q("select count(*)::int n from public.programs where campus_id is null"))[0].n === 4);

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
check("everyone can read global programs", (await asUser(stuM, () => q("select id from public.programs"))).length === 5);
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

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
