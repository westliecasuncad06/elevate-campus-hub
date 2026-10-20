// Verifies the database rules against a REAL Supabase project:
//   npm run verify:rls
// It creates a throwaway campus pair with test users, checks what each role can and cannot do,
// prints PASS/FAIL per check, then deletes everything it created.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID().slice(0, 8);
const password = `Test-${randomUUID()}`;
const created = { users: [], campuses: [] };

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `  ->  ${detail}` : ""}`);
  }
}

async function makeCampus(code, name) {
  const { data, error } = await admin.from("campuses").insert({ code, name }).select("id").single();
  if (error) throw new Error(`campus ${code}: ${error.message}`);
  created.campuses.push(data.id);
  return data.id;
}

async function makeUser(key, role, campusId, gender) {
  const email = `rls-${run}-${key}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role, campus_id: campusId },
  });
  if (error) throw new Error(`user ${key}: ${error.message}`);
  created.users.push(data.user.id);
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    campus_id: campusId,
    role,
    first_name: key,
    last_name: "Tester",
    email,
    phone: `0999${Math.floor(1000000 + Math.random() * 8999999)}`,
    gender,
    birthday: role === "student" ? "2005-01-01" : null,
    year_level: role === "student" ? 1 : null,
    password_changed: true,
    invitation_accepted_at: new Date().toISOString(),
  });
  if (pErr) throw new Error(`profile ${key}: ${pErr.message}`);

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`sign in ${key}: ${sErr.message}`);
  return { id: data.user.id, client };
}

async function cleanup() {
  // Child rows first: attendance/engagement/report rows reference the test users, which blocks deleting them.
  for (const table of ["chat_messages", "batch_students", "engagement_batches", "engagement_logs", "report_submissions", "daily_reports", "attendance_logs", "facilitator_students"]) {
    if (created.campuses.length === 0) break;
    const { error } = await admin.from(table).delete().in("campus_id", created.campuses);
    if (error) console.warn(`  cleanup warning (${table}): ${error.message}`);
  }
  for (const id of created.users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`  cleanup warning (user ${id}): ${error.message}`);
  }
  for (const id of created.campuses) {
    const { error } = await admin.from("campuses").delete().eq("id", id);
    if (error) console.warn(`  cleanup warning (campus ${id}): ${error.message}`);
  }
}

try {
  console.log(`\nRLS verification (run ${run})\n`);
  const c1 = await makeCampus(`T1${run.slice(0, 4)}`.toUpperCase(), "RLS test campus 1");
  const c2 = await makeCampus(`T2${run.slice(0, 4)}`.toUpperCase(), "RLS test campus 2");

  const head1 = await makeUser("head1", "campus_head", c1, "male");
  const head2 = await makeUser("head2", "campus_head", c2, "male");
  const facM = await makeUser("facM", "facilitator", c1, "male");
  const facF = await makeUser("facF", "facilitator", c1, "female");
  const stuM = await makeUser("stuM", "student", c1, "male");
  const stuF = await makeUser("stuF", "student", c1, "female");
  const stuM2 = await makeUser("stuM2", "student", c1, "male");

  console.log("Batches & attendance");
  let r = await facM.client.rpc("start_batch");
  const b1 = r.data?.id;
  check("a facilitator can start a batch", r.data?.batch_number === 1, r.error?.message);
  r = await head2.client.rpc("start_batch");
  const bOther = r.data?.id;
  r = await head1.client.rpc("start_batch");
  const bHead = r.data?.id;
  check("a Campus Head can start a batch", r.data?.batch_number === 1, r.error?.message);
  r = await stuM.client.rpc("start_batch");
  check("a student cannot start a batch", !!r.error);

  r = await facM.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuM.id, p_method: "qr" });
  check("adding a student records attendance and assigns the facilitator", r.data?.action === "added" && r.data?.assigned_now === true && r.data?.facilitator_id === facM.id, r.error?.message);
  r = await facM.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuM.id, p_method: "qr" });
  check("adding the same student again changes nothing", r.data?.action === "already_in_batch", r.error?.message);
  r = await facM.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuF.id, p_method: "phone" });
  check("a student of another gender is still assigned, but flagged", r.data?.assigned_now === true && r.data?.gender_mismatch === true, r.error?.message);
  r = await head1.client.rpc("add_student_to_batch", { p_batch_id: bHead, p_student_id: stuM2.id, p_method: "manual" });
  check("a Campus Head adding a student does NOT assign a facilitator", r.data?.action === "added" && r.data?.assigned_now === false && r.data?.facilitator_id === null, r.error?.message);
  r = await facF.client.rpc("start_batch");
  const bF = r.data?.id;
  r = await facF.client.rpc("add_student_to_batch", { p_batch_id: bF, p_student_id: stuM.id, p_method: "qr" });
  check("a student already in someone's batch can't join another batch today", !!r.error && /already in/i.test(r.error.message), r.error?.message ?? "no error");
  r = await facF.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuM2.id, p_method: "qr" });
  check("you can't add students to someone else's batch", !!r.error);
  r = await head2.client.rpc("add_student_to_batch", { p_batch_id: bOther, p_student_id: stuM2.id, p_method: "qr" });
  check("another campus's head cannot add this campus's student", !!r.error);
  r = await stuM.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuM2.id, p_method: "qr" });
  check("a student cannot add students", !!r.error);

  console.log("\nVisibility");
  let q = await head2.client.from("profiles").select("id").eq("campus_id", c1);
  check("other campus's head sees none of this campus's people", (q.data ?? []).length === 0);
  q = await stuM.client.from("profiles").select("id").eq("role", "student");
  check("a student sees only their own profile among students", (q.data ?? []).length === 1 && q.data[0].id === stuM.id);
  q = await stuM.client.from("attendance_logs").select("id");
  check("a student sees only their own attendance", (q.data ?? []).length === 1);
  const ins = await stuM.client.from("attendance_logs").insert({ campus_id: c1, student_id: stuM.id, log_date: "2000-01-01", scanned_by: stuM.id, entry_method: "manual" });
  check("a student cannot insert attendance directly", !!ins.error);
  q = await facM.client.from("profiles").select("id").eq("role", "facilitator");
  check("a facilitator cannot list other facilitators", (q.data ?? []).every((p) => p.id === facM.id));

  console.log("\nEngagement & reports");
  const log = (await facM.client.from("attendance_logs").select("id").eq("student_id", stuM.id).single()).data;
  let e = await facM.client.rpc("save_engagement", { p_attendance_log_id: log.id, p_is_engaged: true, p_heard_gospel: true, p_accepted_jesus: false, p_wants_dgroup: true });
  check("the batch's facilitator can record engagement", !e.error, e.error?.message);
  const { data: logAfter } = await admin.from("attendance_logs").select("time_out").eq("id", log.id).single();
  check("recording engagement stamps how long it took (time out)", !!logAfter?.time_out);
  e = await facF.client.rpc("save_engagement", { p_attendance_log_id: log.id, p_is_engaged: true, p_heard_gospel: true, p_accepted_jesus: true, p_wants_dgroup: true });
  check("another facilitator can't record engagement for this batch", !!e.error);
  const direct = await facM.client.from("engagement_logs").insert({ attendance_log_id: log.id, student_id: stuM.id, facilitator_id: facM.id, campus_id: c1 });
  check("engagement can't be written directly", !!direct.error);
  q = await stuM.client.from("engagement_logs").select("id");
  check("a student cannot read engagement records", (q.data ?? []).length === 0);

  const logF = (await facM.client.from("attendance_logs").select("id").eq("student_id", stuF.id).single()).data;
  let f = await facM.client.rpc("finish_batch", { p_batch_id: b1 });
  check("a batch can't be finished while a student has no engagement recorded", !!f.error, f.error?.message ?? "no error");
  await facM.client.rpc("save_engagement", { p_attendance_log_id: logF.id, p_is_engaged: false, p_heard_gospel: true, p_accepted_jesus: true, p_wants_dgroup: true });
  const { data: notEngaged } = await admin.from("engagement_logs").select("heard_gospel, accepted_jesus, wants_dgroup").eq("attendance_log_id", logF.id).single();
  check("'No' to the first question clears the other answers", notEngaged?.heard_gospel === false && notEngaged?.wants_dgroup === false);
  f = await facM.client.rpc("finish_batch", { p_batch_id: b1 });
  check("a complete batch finishes and goes to history", f.data?.action === "finished", f.error?.message);
  r = await facM.client.rpc("add_student_to_batch", { p_batch_id: b1, p_student_id: stuM2.id, p_method: "qr" });
  check("a finished batch takes no more students", !!r.error);
  e = await facM.client.rpc("save_engagement", { p_attendance_log_id: log.id, p_is_engaged: false, p_heard_gospel: false, p_accepted_jesus: false, p_wants_dgroup: false });
  check("a finished batch's history can't be edited", !!e.error);
  q = await facF.client.from("engagement_batches").select("id");
  check("a facilitator sees only their own batches", (q.data ?? []).length === 1);
  q = await head1.client.from("engagement_batches").select("id");
  check("a Campus Head sees every batch in their campus", (q.data ?? []).length === 3);
  q = await head2.client.from("engagement_batches").select("id");
  check("another campus's head sees only their own", (q.data ?? []).length === 1);

  // The test campuses use the default Asia/Manila timezone, so "today" must be Manila's today.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const rep = await head1.client.rpc("compute_daily_report", { p_campus_id: c1, p_date: today });
  const totals = Array.isArray(rep.data) ? rep.data[0] : rep.data;
  check("daily report counts students, engagement and volunteers", !rep.error && totals?.total_attendance >= 1 && totals?.students_engaged === 1 && totals?.students_heard_gospel === 1 && totals?.students_wants_dgroup === 1 && totals?.volunteers_count >= 1, rep.error?.message ?? JSON.stringify(totals));

  const fr = await facM.client.from("daily_reports").insert({ campus_id: c1, report_date: today, submitted_by: facM.id });
  check("a facilitator cannot write daily reports", !!fr.error);
  const hr = await head1.client.from("daily_reports").insert({ campus_id: c1, report_date: today, total_attendance: 3, submitted_by: head1.id }).select("id").single();
  check("a Campus Head can write the daily report", !hr.error, hr.error?.message);
  if (hr.data) {
    await head1.client.from("daily_reports").update({ is_locked: true }).eq("id", hr.data.id);
    const edit = await head1.client.from("daily_reports").update({ total_attendance: 99 }).eq("id", hr.data.id);
    check("a locked report cannot be edited", !!edit.error);
    const unlock = await head1.client.from("daily_reports").update({ is_locked: false }).eq("id", hr.data.id);
    check("a locked report can be unlocked", !unlock.error, unlock.error?.message);
  }
  const cross = await head2.client.from("daily_reports").select("id").eq("campus_id", c1);
  check("another campus's head cannot read this campus's reports", (cross.data ?? []).length === 0);

  console.log("\nSame-gender chat");
  const send = (from, to, text) => from.client.from("chat_messages").insert({ sender_id: from.id, receiver_id: to.id, campus_id: c1, message: text }).select("id").single();
  let m = await send(facM, stuM, "hello");
  check("assigned facilitator -> same-gender student: allowed", !m.error, m.error?.message);
  const sentId = m.data?.id;
  m = await send(stuM, facM, "hi back");
  check("student -> assigned same-gender facilitator: allowed", !m.error, m.error?.message);
  m = await send(facM, stuF, "hello");
  check("male facilitator -> female student (assigned but different gender): blocked", !!m.error);
  m = await send(stuF, facM, "hello");
  check("female student -> male facilitator: blocked", !!m.error);
  m = await send(stuM, facF, "hello");
  check("student -> a facilitator they're not assigned to: blocked", !!m.error);
  m = await send(facM, stuM2, "hello");
  check("facilitator -> student who isn't assigned to them: blocked", !!m.error);

  q = await stuF.client.from("chat_messages").select("id");
  check("an unrelated student can't read the conversation", (q.data ?? []).length === 0);
  q = await facF.client.from("chat_messages").select("id");
  check("another facilitator can't read the conversation", (q.data ?? []).length === 0);

  if (sentId) {
    const tamper = await stuM.client.from("chat_messages").update({ message: "edited" }).eq("id", sentId);
    check("a receiver cannot edit message text (permission denied)", !!tamper.error);
    const { data: after } = await admin.from("chat_messages").select("message, is_read").eq("id", sentId).single();
    check("message text is unchanged after an edit attempt", after?.message === "hello");
    const read = await stuM.client.from("chat_messages").update({ is_read: true }).eq("id", sentId);
    const { data: afterRead } = await admin.from("chat_messages").select("is_read").eq("id", sentId).single();
    check("the receiver can mark a message as read", !read.error && afterRead?.is_read === true, read.error?.message);
    const del = await facM.client.from("chat_messages").delete().eq("id", sentId);
    const { data: still } = await admin.from("chat_messages").select("id").eq("id", sentId).maybeSingle();
    check("nobody can delete messages", !!still && !!del.error);
  }

  console.log("\nAdmin-only data");
  const sl = await head1.client.from("system_logs").select("id");
  check("a Campus Head cannot read system logs", (sl.data ?? []).length === 0);
  const camp = await head1.client.from("campuses").update({ name: "hacked" }).eq("id", c1);
  const { data: campAfter } = await admin.from("campuses").select("name").eq("id", c1).single();
  // RLS makes a forbidden UPDATE affect zero rows (no error), so the proof is that the data is unchanged.
  check("a Campus Head cannot edit campuses", campAfter?.name === "RLS test campus 1" && !camp.error);
  const prog = await head1.client.from("programs").insert({ code: "HACK", name: "Hack" });
  check("a Campus Head cannot create programs", !!prog.error);
} catch (error) {
  failed++;
  console.error("\nSetup problem:", error instanceof Error ? error.message : error);
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
