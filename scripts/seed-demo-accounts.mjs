// Creates demo accounts in the GRC campus so every role can be tried by hand:
//   npm run seed:demo
// Safe to re-run (existing accounts are skipped). DEMO DATA ONLY: delete these users before going live.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase keys in .env.local");
  process.exit(1);
}

// Never hard-code a password in the repo. Set DEMO_ACCOUNT_PASSWORD to choose one; otherwise a random one is
// generated for the accounts created in this run and printed at the end (existing accounts keep theirs).
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || `Demo-${randomBytes(9).toString("base64url")}`;

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: campus } = await admin.from("campuses").select("id").eq("code", "GRC").single();
const { data: program } = await admin.from("programs").select("id").eq("code", "BSIT").is("campus_id", null).single();
if (!campus || !program) {
  console.error("GRC campus / BSIT program not found. Did you run supabase/setup.sql?");
  process.exit(1);
}

const people = [
  { key: "admin", role: "super_admin", first: "Demo", last: "Admin", gender: null, phone: null, email: "demo.admin@example.test" },
  { key: "head", role: "campus_head", first: "Carlo", last: "Head", gender: "male", phone: "09170000001", email: "demo.head@example.test" },
  { key: "facM", role: "facilitator", first: "Miguel", last: "Facilitator", gender: "male", phone: "09170000002", email: "demo.facilitator.male@example.test" },
  { key: "facF", role: "facilitator", first: "Faith", last: "Facilitator", gender: "female", phone: "09170000003", email: "demo.facilitator.female@example.test" },
  { key: "stuM", role: "student", first: "Juan", last: "Student", gender: "male", phone: "09170000004", email: "demo.student.male@example.test", year: 2 },
  { key: "stuF", role: "student", first: "Maria", last: "Student", gender: "female", phone: "09170000005", email: "demo.student.female@example.test", year: 1 },
];

const ids = {};
for (const p of people) {
  const { data: existing } = await admin.from("profiles").select("id").ilike("email", p.email).maybeSingle();
  if (existing) {
    ids[p.key] = existing.id;
    console.log(`skip   ${p.email} (already exists)`);
    continue;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    app_metadata: { role: p.role, campus_id: p.role === "super_admin" ? null : campus.id },
  });
  if (error) throw new Error(`${p.email}: ${error.message}`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    campus_id: p.role === "super_admin" ? null : campus.id,
    role: p.role,
    first_name: p.first,
    last_name: p.last,
    email: p.email,
    phone: p.phone,
    gender: p.gender,
    birthday: p.role === "student" ? "2005-06-15" : null,
    program_id: p.role === "student" ? program.id : null,
    year_level: p.year ?? null,
    password_changed: true,
    invitation_sent_at: new Date().toISOString(),
    invitation_accepted_at: new Date().toISOString(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`${p.email}: ${profileError.message}`);
  }
  ids[p.key] = data.user.id;
  console.log(`create ${p.email} (${p.role})`);
}

// A student who has not accepted their invitation yet (shows the "Pending invitation" badge; can't sign in).
const pendingEmail = "demo.pending@example.test";
const { data: pendingExisting } = await admin.from("profiles").select("id").ilike("email", pendingEmail).maybeSingle();
if (!pendingExisting) {
  const { data, error } = await admin.auth.admin.createUser({
    email: pendingEmail,
    app_metadata: { role: "student", campus_id: campus.id },
  });
  if (error) throw new Error(`${pendingEmail}: ${error.message}`);
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    campus_id: campus.id,
    role: "student",
    first_name: "Pedro",
    last_name: "Pending",
    email: pendingEmail,
    phone: "09170000006",
    gender: "male",
    birthday: "2005-03-02",
    program_id: program.id,
    year_level: 3,
    invitation_sent_at: new Date().toISOString(),
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`${pendingEmail}: ${profileError.message}`);
  }
  console.log(`create ${pendingEmail} (student, pending invitation)`);
} else {
  console.log(`skip   ${pendingEmail} (already exists)`);
}

// Same-gender pairs so chat works out of the box.
for (const [student, facilitator] of [["stuM", "facM"], ["stuF", "facF"]]) {
  const { data: has } = await admin.from("facilitator_students").select("id").eq("student_id", ids[student]).eq("is_active", true).maybeSingle();
  if (!has) {
    await admin.from("facilitator_students").insert({ facilitator_id: ids[facilitator], student_id: ids[student], campus_id: campus.id });
    console.log(`assign ${student} -> ${facilitator}`);
  }
}

// Demo accounts are test data, so mark them as having accepted the current Data Privacy Notice. Real accounts must
// accept it themselves (at account setup, or once at their next sign-in).
const privacySource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "privacy.ts"), "utf8");
const privacyVersion = privacySource.match(/PRIVACY_VERSION = "([^"]+)"/)?.[1];
if (privacyVersion) {
  const now = new Date().toISOString();
  const { error: privacyError } = await admin
    .from("profiles")
    .update({
      data_consent_at: now,
      data_consent_version: privacyVersion,
      privacy_accepted_at: now,
      privacy_accepted_version: privacyVersion,
    })
    .like("email", "demo.%@example.test");
  console.log(privacyError ? `privacy: ${privacyError.message}` : `demo accounts marked as accepted (notice ${privacyVersion})`);
}

console.log("\nDone. Password for the demo accounts created in THIS run:", DEMO_PASSWORD);
