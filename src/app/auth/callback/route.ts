import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleCallbackError, type GoogleLoginError } from "@/lib/google-login";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import type { Profile } from "@/lib/types";

/**
 * Where Google sends people back to (via Supabase): {SITE}/auth/callback?code=...
 * Exchanges the code for a session, then lets in ONLY someone who was invited (has a profile) and is still active.
 * Everything else (password step, registration details, privacy notice) is decided afterwards by the same checks as a
 * password sign-in, in requireProfile().
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const toLogin = (error: GoogleLoginError | "inactive") => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("error", error);
    return NextResponse.redirect(url);
  };

  const providerError = googleCallbackError(searchParams);
  if (providerError) return toLogin(providerError);

  const code = searchParams.get("code");
  if (!code) return toLogin("google_failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return toLogin("google_failed");
  const user = data.user;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role" | "is_active">>();
  if (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("google_failed");
  }

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    await removeStrayGoogleUser(user.id, user.created_at, user.identities?.map((i) => i.provider) ?? []);
    return toLogin("google_not_invited");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("inactive");
  }

  // `next` may carry its own query string (e.g. /student?tab=qr), so resolve it as a URL instead of setting a pathname.
  const destination = safeNext(searchParams.get("next")) ?? ROLE_HOME[profile.role];
  return NextResponse.redirect(new URL(destination, request.nextUrl.origin));
}

/**
 * Public sign-ups are off, so Supabase normally refuses to create an account for an unknown Google address. If that
 * setting is ever turned on, a Google-only account with no profile would be left behind, and it would block inviting
 * that email later ("already registered"). Remove it, but only when it is clearly that: brand new, only Google, no profile.
 */
async function removeStrayGoogleUser(userId: string, createdAt: string | undefined, providers: string[]) {
  try {
    const justCreated = createdAt ? Date.now() - new Date(createdAt).getTime() < 10 * 60 * 1000 : false;
    const onlyGoogle = providers.length > 0 && providers.every((p) => p === "google");
    if (!justCreated || !onlyGoogle) return;

    const admin = createAdminClient();
    const { data: existing } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (existing) return;
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Cleanup is best-effort: the person is already signed out and turned away.
  }
}
