/**
 * The Content Security Policy sent with every page: the browser is told exactly where scripts, data and frames may come
 * from, so a script an attacker manages to slip into a page (cross-site scripting) is refused instead of run.
 *
 * Scripts must carry this request's random nonce (Next adds it to its own scripts), so nothing injected can run. No imports
 * on purpose (it is also loaded by tests).
 */
export interface CspOptions {
  nonce: string;
  /** `next dev` needs eval for its error overlay; production does not. */
  isDev: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL: the database / sign-in / realtime address the browser may talk to. */
  supabaseUrl?: string;
  /** Cloudflare Turnstile is on (its script and frame must be allowed). */
  turnstile: boolean;
}

function origin(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, isDev, supabaseUrl, turnstile }: CspOptions): string {
  const supabase = origin(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;

  const connect = ["'self'", supabase, supabaseWs, "https://fastly.jsdelivr.net"].filter(Boolean) as string[];
  if (isDev) connect.push("ws://localhost:*", "http://localhost:*");

  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'"];
  if (isDev) script.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    // Style attributes (set by the UI library) can't carry a nonce, so inline styles are allowed; scripts are what matter.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    // The QR scanner fetches its decoder (WebAssembly) from jsDelivr when the phone has no built-in one.
    "connect-src": connect,
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:", "data:"],
    "frame-src": turnstile ? ["https://challenges.cloudflare.com"] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Where a form may send people: itself, and Google/Supabase for "Continue with Google".
    "form-action": ["'self'", "https://accounts.google.com", ...(supabase ? [supabase] : [])],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
