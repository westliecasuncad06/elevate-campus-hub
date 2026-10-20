import type { Metadata } from "next";
import { NotificationList } from "@/components/notifications/notification-list";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireProfile } from "@/lib/auth";
import { loadNotificationFeed } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireProfile();
  const supabase = await createClient();
  const feed = await loadNotificationFeed(supabase, 100);

  return (
    <>
      <PageHeader title="Notifications" description="Tap one to go straight to what it's about." />
      {feed.items.length === 0 ? (
        <EmptyState title="Nothing yet" hint="Messages, new students, finished batches and other updates will show up here." />
      ) : (
        <NotificationList initial={feed.items} />
      )}
    </>
  );
}
