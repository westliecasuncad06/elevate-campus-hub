"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractGoogleDocId } from "@/lib/google";
import type { ActionResult } from "@/lib/types";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Super Admin: create a campus (campusId = null) or update an existing one. */
export async function saveCampusAction(
  campusId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return { ok: false, error: "You don't have permission to do that." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "Asia/Manila";
  const docInput = String(formData.get("target_google_doc") ?? "").trim();
  const formWebhook = String(formData.get("google_form_webhook_url") ?? "").trim();
  const isActive = formData.get("is_active") !== "off";

  if (!/^[A-Z0-9_-]{2,12}$/.test(code)) {
    return { ok: false, error: "Campus code must be 2–12 letters or numbers (for example GRC)." };
  }
  if (!name) return { ok: false, error: "Enter the campus name." };
  if (!isValidTimezone(timezone)) return { ok: false, error: `“${timezone}” is not a valid timezone (try Asia/Manila).` };

  // Accept either a full Google Docs URL or a bare document ID.
  const docId = docInput ? (extractGoogleDocId(docInput) ?? (/^[a-zA-Z0-9-_]{20,}$/.test(docInput) ? docInput : null)) : null;
  if (docInput && !docId) return { ok: false, error: "That doesn't look like a Google Docs link." };
  if (formWebhook && !/^https:\/\//.test(formWebhook)) {
    return { ok: false, error: "The Google Form webhook URL must start with https://" };
  }

  const values = {
    code,
    name,
    timezone,
    target_google_doc_id: docId,
    google_form_webhook_url: formWebhook || null,
    is_active: isActive,
  };

  const supabase = await createClient();
  const { error } = campusId
    ? await supabase.from("campuses").update(values).eq("id", campusId)
    : await supabase.from("campuses").insert(values);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `A campus with code ${code} already exists.` };
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: campusId ? "Campus updated." : "Campus created." };
}
