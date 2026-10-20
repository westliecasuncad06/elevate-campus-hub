// Applies the branded email templates in docs/email-templates/ to your Supabase project, so you don't have to paste
// them into the dashboard by hand:
//   npm run supabase:email-templates                              send both templates
//   node --env-file=.env.local scripts/apply-email-templates.mjs --dry
//        show what would be sent (use `node` directly when passing flags: PowerShell swallows npm's `--`)
//   node --env-file=.env.local scripts/apply-email-templates.mjs --site-url https://app.vercel.app
//        also sets Supabase's Site URL and adds <url>/** to the allowed Redirect URLs (existing ones are kept)
//
// Needs SUPABASE_ACCESS_TOKEN in .env.local: Supabase > Account (top right) > Access Tokens > Generate new token.
// The token can manage ALL your Supabase projects: keep it secret and delete it once you're done.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const siteUrlArg = args.includes("--site-url") ? args[args.indexOf("--site-url") + 1] : null;

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = projectUrl ? new URL(projectUrl).hostname.split(".")[0] : null;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!dry) {
  if (!token || token.startsWith("<")) {
    fail(
      "SUPABASE_ACCESS_TOKEN is not set in .env.local.\n" +
        "Supabase dashboard > your account (top right) > Access Tokens > Generate new token, then paste it after\n" +
        "SUPABASE_ACCESS_TOKEN= in .env.local.",
    );
  }
  if (!ref) fail("NEXT_PUBLIC_SUPABASE_URL is missing in .env.local.");
}

/** The HTML body of a template file: everything from the doctype down (the header comment is only for humans). */
function body(file) {
  const html = readFileSync(join(root, "docs", "email-templates", file), "utf8");
  const start = html.toLowerCase().indexOf("<!doctype html>");
  if (start < 0) fail(`${file} has no <!doctype html> line.`);
  return html.slice(start).trim();
}

const patch = {
  mailer_subjects_invite: "You're invited to Elevate Campus Hub",
  mailer_templates_invite_content: body("invite.html"),
  mailer_subjects_recovery: "Choose your Elevate Campus Hub password",
  mailer_templates_recovery_content: body("recovery.html"),
};

const api = (path, init = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

async function readConfig() {
  const res = await api("config/auth");
  if (res.status === 401 || res.status === 403) {
    fail("Supabase rejected the access token (401/403). Generate a new one and update SUPABASE_ACCESS_TOKEN.");
  }
  if (!res.ok) fail(`Couldn't read the auth settings (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
}

if (siteUrlArg) {
  const url = siteUrlArg.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) fail("--site-url must start with http:// or https://");
  if (dry) {
    console.log(`Would set Site URL to ${url} and allow ${url}/**`);
  } else {
    const current = await readConfig();
    const allowed = new Set(
      String(current.uri_allow_list ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    allowed.add(`${url}/**`);
    patch.site_url = url;
    patch.uri_allow_list = [...allowed].join(",");
  }
}

if (dry) {
  for (const [key, value] of Object.entries(patch)) {
    console.log(`${key}: ${typeof value === "string" && value.length > 80 ? `${value.length} characters of HTML` : value}`);
  }
  console.log("\nDry run: nothing was sent.");
  process.exit(0);
}

const res = await api("config/auth", { method: "PATCH", body: JSON.stringify(patch) });
if (!res.ok) fail(`Supabase refused the update (HTTP ${res.status}): ${await res.text()}`);

// Read it back so we know it really took.
const after = await readConfig();
const ok =
  after.mailer_templates_invite_content?.length === patch.mailer_templates_invite_content.length &&
  after.mailer_templates_recovery_content?.length === patch.mailer_templates_recovery_content.length;
console.log(ok ? "Email templates applied and verified (Invite user + Reset password)." : "Sent, but the stored templates don't match: check the dashboard.");
if (patch.site_url) console.log(`Site URL is now ${after.site_url}.\nRedirect URLs: ${after.uri_allow_list}`);
