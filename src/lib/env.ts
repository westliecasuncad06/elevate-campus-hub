/** True once real Supabase values (not the .env.local.example placeholders) are in place. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const looksReal = (value: string) => value.length > 0 && !value.includes("<") && !value.startsWith("your-");
  return /^https?:\/\//.test(url) && looksReal(url) && looksReal(anon) && anon.length > 20;
}

export const SETUP_HELP_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Setup needed · Elevate Campus Hub</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f5f7f4;color:#18262b;margin:0;display:grid;min-height:100dvh;place-items:center;padding:24px}
  main{max-width:34rem;background:#fff;border:1px solid #e4ece8;border-radius:16px;padding:28px}
  h1{margin:0 0 8px;font-size:1.4rem} code{background:#eef3f0;padding:2px 6px;border-radius:6px}
  li{margin:6px 0}
</style></head>
<body><main>
<h1>Almost there: connect Supabase</h1>
<p>This app needs your Supabase project details before it can start.</p>
<ol>
  <li>Open <code>.env.local</code> in the project folder.</li>
  <li>Fill in <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> (Supabase &rarr; Project Settings &rarr; API).</li>
  <li>Restart the dev server (<code>npm run dev</code>).</li>
</ol>
<p>Step-by-step instructions are in <code>README.md</code>.</p>
</main></body></html>`;
