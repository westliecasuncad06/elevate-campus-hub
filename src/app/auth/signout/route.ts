import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function loginUrl(request: NextRequest, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (error) url.searchParams.set("error", error);
  return url;
}

// scope "local": signing out here must not end the same person's sessions on their other devices
// (Supabase's default is "global", which revokes all of them).

/** Sign out button (POST from the app shell). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(loginUrl(request), 303);
}

/** Used by layouts when an account was deactivated while signed in. */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const error = reason === "inactive" || reason === "no_profile" ? reason : undefined;
  return NextResponse.redirect(loginUrl(request, error));
}
