// Applies the SQL files in supabase/migrations/ to your Supabase database, in order, once each:
//   npm run db:migrate            apply anything pending
//   npm run db:migrate -- --dry   just list what's pending
//
// Needs SUPABASE_DB_URL in .env.local (Supabase > Connect > Session pooler > URI, with your database
// password filled in). Applied files are recorded in public.schema_migrations, so running it again is safe.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const dry = process.argv.includes("--dry");

// Files 0001-0004 were applied by hand via supabase/setup.sql before this runner existed.
const BASELINE = ["0001_schema.sql", "0002_rls.sql", "0003_functions.sql", "0004_seed.sql"];

const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("[YOUR-PASSWORD]") || url.includes("<")) {
  console.error(
    "\nSUPABASE_DB_URL is not set in .env.local.\n" +
      "Supabase dashboard > Connect > Session pooler > copy the URI, replace [YOUR-PASSWORD] with your\n" +
      "database password, and paste it after SUPABASE_DB_URL= in .env.local.\n",
  );
  process.exit(1);
}

// Supabase's certificate isn't in Node's trust store; the connection is still encrypted.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (error) {
  console.error(`\nCould not connect to the database: ${error.message}`);
  console.error("Check the password in SUPABASE_DB_URL (Project Settings > Database > Reset database password if unsure).\n");
  process.exit(1);
}

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
  `);

  const { rows: applied } = await client.query("select name from public.schema_migrations");
  const done = new Set(applied.map((r) => r.name));

  // First run on a project that was set up by pasting setup.sql: record those files as already applied.
  if (done.size === 0) {
    const { rows } = await client.query("select to_regclass('public.campuses') is not null as has_schema");
    if (rows[0].has_schema) {
      for (const name of BASELINE) {
        await client.query("insert into public.schema_migrations (name) values ($1) on conflict do nothing", [name]);
        done.add(name);
      }
      console.log(`Existing database detected: marked ${BASELINE.join(", ")} as already applied.`);
    }
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    console.log("Database is up to date. Nothing to apply.");
  } else if (dry) {
    console.log(`Pending: ${pending.join(", ")}`);
  } else {
    for (const file of pending) {
      process.stdout.write(`Applying ${file} ... `);
      const sql = readFileSync(join(dir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("done");
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED");
        console.error(`\n${file} was rolled back, nothing was changed: ${error.message}\n`);
        process.exitCode = 1;
        break;
      }
    }
  }
} finally {
  await client.end();
}
