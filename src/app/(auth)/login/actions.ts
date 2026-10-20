"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/accounts";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult, Profile } from "@/lib/types";

/**
 * "Continue with Google": sends the person to Google, which sends them back to /auth/callback. Only accounts that were
 * invited can finish signing in (the callback checks), because public sign-ups are off in Supabase.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const callback = new URL("/auth/callback", await siteUrl());
  const next = safeNext(formData.get("next"));
  if (next) callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    // Let people with several Google accounts pick the right one instead of silently using the last one.
    options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=google_failed");
  redirect(data.url);
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Email or password is incorrect." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, password_changed")
    .eq("id", data.user.id)
    .maybeSingle<Pick<Profile, "role" | "is_active" | "password_changed">>();

  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, error: "Your account has no profile yet. Ask your Campus Head or IT to check it." };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, error: "This account is deactivated. Contact your Campus Head or IT." };
  }
  if (!profile.password_changed) redirect("/set-password");

  redirect(safeNext(formData.get("next")) ?? ROLE_HOME[profile.role]);
}
