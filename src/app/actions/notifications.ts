"use server";

import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadNotificationFeed, type NotificationFeed } from "@/lib/notifications";
import type { ActionResult } from "@/lib/types";

/** Marks one notification read. Row Level Security only lets people update their own. */
export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: "Sign in again." };

  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("recipient_id", profile.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: "Sign in again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", profile.id)
    .eq("is_read", false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Fresh copy of the bell's list, used when a live update arrives. */
export async function fetchNotificationFeedAction(limit = 15): Promise<ActionResult<NotificationFeed>> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: "Sign in again." };

  const supabase = await createClient();
  return { ok: true, data: await loadNotificationFeed(supabase, Math.min(Math.max(limit, 1), 100)) };
}
