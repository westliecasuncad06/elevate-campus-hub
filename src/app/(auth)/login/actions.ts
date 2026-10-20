"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/roles";
import type { ActionResult, Profile } from "@/lib/types";

/** Only allow same-site relative redirects. */
function safeNext(next: FormDataEntryValue | null): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
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
