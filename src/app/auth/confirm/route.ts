import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing route for the link in invitation / password emails:
 *   {SITE}/auth/confirm?token_hash=...&type=invite
 * Verifies the one-time token (which signs the person in) and sends them to pick a password.
 *
 * If the email still uses Supabase's default link, the sign-in token arrives in the URL
 * fragment (#access_token=...), which the server can't read. In that case we pass the visitor
 * to /auth/finish, a page that reads the fragment in the browser.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const target = request.nextUrl.clone();
  target.search = "";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = "/set-password";
      return NextResponse.redirect(target);
    }
    target.pathname = "/login";
    target.searchParams.set("error", "invite_expired");
    return NextResponse.redirect(target);
  }

  // No token in the query string: the browser may be carrying one in the #fragment, which
  // survives this redirect.
  target.pathname = "/auth/finish";
  return NextResponse.redirect(target);
}
