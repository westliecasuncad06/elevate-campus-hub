// Creates the first Super Admin (IT) account. Run once after the database is set up:
//   npm run seed:admin
// Reads .env.local (Node's --env-file flag, see package.json).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_SUPER_ADMIN_EMAIL;
const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
const firstName = process.env.SEED_SUPER_ADMIN_FIRST_NAME || "IT";
const lastName = process.env.SEED_SUPER_ADMIN_LAST_NAME || "Admin";

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

if (!url || url.includes("<your-project-id>")) fail("NEXT_PUBLIC_SUPABASE_URL is missing in .env.local");
if (!serviceKey || serviceKey.startsWith("<")) fail("SUPABASE_SERVICE_ROLE_KEY is missing in .env.local");
if (!email || email === "you@example.com") fail("Set SEED_SUPER_ADMIN_EMAIL in .env.local");
if (!password || password.startsWith("<") || password.length < 8) {
  fail("Set SEED_SUPER_ADMIN_PASSWORD (at least 8 characters) in .env.local");
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing, error: lookupError } = await supabase
  .from("profiles")
  .select("id, email")
  .ilike("email", email)
  .maybeSingle();

if (lookupError) {
  fail(
    `Could not read the profiles table (${lookupError.message}). ` +
      "Did you run supabase/setup.sql in the Supabase SQL Editor first?",
  );
}
if (existing) {
  console.log(`Super Admin ${email} already exists. Nothing to do.`);
  // Let open network handles close before exiting (avoids a harmless libuv crash message on Windows).
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(0);
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "super_admin" },
  user_metadata: { first_name: firstName, last_name: lastName },
});
if (createError) fail(`Could not create the auth user: ${createError.message}`);

const { error: profileError } = await supabase.from("profiles").insert({
  id: created.user.id,
  role: "super_admin",
  campus_id: null,
  first_name: firstName,
  last_name: lastName,
  email,
  password_changed: true,
  invitation_accepted_at: new Date().toISOString(),
});

if (profileError) {
  // Roll back the auth user so the script can be re-run cleanly.
  await supabase.auth.admin.deleteUser(created.user.id);
  fail(`Could not create the profile: ${profileError.message}`);
}

console.log(`Super Admin created: ${email}\nYou can now sign in at /login.`);
