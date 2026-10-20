// Fixes first/last names that were saved in capitals ("JARDIN" -> "Jardin"), using the same rule the app applies when a
// name is typed. Shows what it would change; add --apply to write it. Names already written normally are never touched.
//
//   npm run names:fix            (list the changes)
//   npm run names:fix -- --apply (save them)
import { createClient } from "@supabase/supabase-js";
import { formatName } from "../src/lib/names.ts";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profiles, error } = await db.from("profiles").select("id, first_name, last_name, role");
if (error) {
  console.error(`Couldn't read the profiles: ${error.message}`);
  process.exit(1);
}

let changed = 0;
for (const p of profiles ?? []) {
  const first = formatName(p.first_name);
  const last = formatName(p.last_name);
  if (first === p.first_name && last === p.last_name) continue;
  changed++;
  console.log(`${p.role}: "${p.first_name} ${p.last_name}" -> "${first} ${last}"`);
  if (apply) {
    const { error: updateError } = await db.from("profiles").update({ first_name: first, last_name: last }).eq("id", p.id);
    if (updateError) console.error(`  could not save: ${updateError.message}`);
  }
}
console.log(changed === 0 ? "Every name is already written normally." : apply ? `\nFixed ${changed} name(s).` : `\n${changed} name(s) would change. Run again with --apply to save them.`);
