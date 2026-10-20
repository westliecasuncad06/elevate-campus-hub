import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SETUP_HELP_HTML, isSupabaseConfigured } from "@/lib/env";
import { ROLE_HOME, isRole } from "@/lib/roles";

// Paths reachable without a session. /api/cron/* is protected by CRON_SECRET in the route.
const PUBLIC_PREFIXES = ["/login", "/register", "/auth", "/api/cron", "/privacy"];

function isPublic(pathname: string) {
  // "/" is the public front page (signed-in people are sent on to their home further down).
  return pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 1. Refreshes the Supabase session cookie on every request.
 * 2. Redirects signed-out visitors to /login.
 * 3. Sends signed-in people from "/" and "/login" to their home area. Staying inside your own area (/admin,
 *    /campus-head, /facilitator, /student) is enforced by each area's layout against the database, not here.
 * The role in the JWT's app_metadata is only a hint for those redirects: it can be stale after a role change.
 */
export async function proxy(request: NextRequest) {
  // A fresh checkout has placeholder values: show setup help instead of a stack trace.
  if (!isSupabaseConfigured()) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
    return new NextResponse(SETUP_HELP_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must run before anything else so a refreshed token can be written to the response.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const metaRole = (claims?.app_metadata as { role?: unknown } | undefined)?.role;
  const role = isRole(metaRole) ? metaRole : null;
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string, search?: URLSearchParams) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search ? `?${search.toString()}` : "";
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed auth cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  if (!claims) {
    if (isPublic(pathname)) return response;
    const params = new URLSearchParams();
    if (pathname !== "/") params.set("next", pathname + request.nextUrl.search);
    return redirectTo("/login", params);
  }

  // Signed in from here on.
  if (pathname === "/login") return redirectTo(role ? ROLE_HOME[role] : "/");
  if (pathname === "/" && role) return redirectTo(ROLE_HOME[role]);

  // Deliberately NOT bouncing people out of another role's area here. The role in the token can be up to an hour
  // stale after a Super Admin changes someone's role or campus, and redirecting on it would send them back and forth
  // with the page-level check (which reads the database) until the token refreshed. Each area's layout calls
  // requireRole(), which is the real gate; the proxy only needs to know who is signed in.

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
