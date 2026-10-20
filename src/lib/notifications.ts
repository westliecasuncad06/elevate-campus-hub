import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType = "chat" | "assignment" | "attendance" | "batch" | "engagement" | "invitation" | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** App path to open when clicked, for example /facilitator/chat?with=<id>. */
  link: string;
  /** How many events were folded into this one (several chat messages from one person). */
  count: number;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

interface Row {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string;
  count: number;
  is_read: boolean;
  created_at: string;
}

const COLUMNS = "id, type, title, body, link, count, is_read, created_at";

export function toItem(row: Row): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    count: row.count,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

/** The viewer's newest notifications plus how many are unread. Row Level Security limits this to their own. */
export async function loadNotificationFeed(supabase: SupabaseClient, limit = 15): Promise<NotificationFeed> {
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select(COLUMNS).order("created_at", { ascending: false }).limit(limit),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
  ]);
  return { items: ((data ?? []) as Row[]).map(toItem), unread: count ?? 0 };
}
