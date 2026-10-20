"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { inspectGoogleForm, normalizeFormUrl } from "@/lib/google-form";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "Only the Campus Head can do that." };
const MAX_FORMS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Save a Google Form so reports can be sent to it. The link is checked first (reachable, accepts responses without a
 * sign-in, and its questions are ones the system can answer), so a form that won't work is refused here, not at send time.
 */
export async function addGoogleFormAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;

  const link = String(formData.get("url") ?? "").trim();
  if (!normalizeFormUrl(link)) {
    return { ok: false, error: "Paste the form's link. It looks like docs.google.com/forms/d/e/…/viewform." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("campus_google_forms")
    .select("id", { count: "exact", head: true })
    .eq("campus_id", actor.campus_id);
  if ((count ?? 0) >= MAX_FORMS) return { ok: false, error: `You can save up to ${MAX_FORMS} forms. Remove one first.` };

  const checked = await inspectGoogleForm(link);
  if (!checked.ok) return { ok: false, error: checked.error };

  // The name is optional: use the form's own title.
  const name = (String(formData.get("name") ?? "").trim() || checked.title || "Google Form").slice(0, 80);

  const { error } = await supabase
    .from("campus_google_forms")
    .insert({ campus_id: actor.campus_id, name, url: checked.url, created_by: actor.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That form is already saved." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/campus-head/reports");
  return { ok: true, message: `Saved “${name}”.` };
}

/** Remove a saved form. Reports already sent to it stay in "Sent reports". */
export async function removeGoogleFormAction(formId: string): Promise<ActionResult> {
  const actor = await getActor("campus_head");
  if (!actor?.campus_id) return FORBIDDEN;
  if (!UUID.test(formId)) return { ok: false, error: "That form couldn't be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campus_google_forms")
    .delete()
    .eq("id", formId)
    .eq("campus_id", actor.campus_id)
    .select("name");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "That form was already removed." };

  revalidatePath("/campus-head/reports");
  return { ok: true, message: `Removed “${data[0].name}”.` };
}
