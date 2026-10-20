"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchNotificationFeedAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { createClient } from "@/lib/supabase/client";
import type { NotificationFeed, NotificationItem } from "@/lib/notifications";
import { NotificationRow } from "./notification-row";

/** True when the link points at the page the person is already looking at. */
function isCurrentPage(link: string): boolean {
  const url = new URL(link, window.location.origin);
  return url.pathname === window.location.pathname && (url.search === "" || url.search === window.location.search);
}

/**
 * The bell in the header: unread count, a list of the latest notifications, and live updates.
 * Clicking a notification marks it read and opens what it's about.
 */
export function NotificationBell({ userId, initial }: { userId: string; initial: NotificationFeed }) {
  const router = useRouter();
  const [feed, setFeed] = useState(initial);
  const [open, setOpen] = useState(false);

  // The layout re-reads the feed on every navigation: take the fresh copy when it arrives.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setFeed(initial);
  }

  const openItem = useCallback(
    (item: NotificationItem) => {
      if (!item.isRead) {
        setFeed((f) => ({
          unread: Math.max(0, f.unread - 1),
          items: f.items.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)),
        }));
        void markNotificationReadAction(item.id);
      }
      setOpen(false);
      router.push(item.link);
    },
    [router],
  );

  function markAll() {
    setFeed((f) => ({ unread: 0, items: f.items.map((i) => ({ ...i, isRead: true })) }));
    void markAllNotificationsReadAction();
  }

  // Live: a new notification for me arrives over Supabase Realtime.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Next tick, so React's dev double-mount can't leave a half-closed channel behind.
    const timer = setTimeout(() => {
      channel = supabase
        .channel(`notifications-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
          async (payload) => {
            const row = payload.new as { id: string; title: string; body: string | null; link: string };

            // Already on the page it's about: nothing to announce.
            if (isCurrentPage(row.link)) {
              void markNotificationReadAction(row.id);
            } else {
              toast(row.title, {
                description: row.body ?? undefined,
                action: {
                  label: "Open",
                  onClick: () => {
                    void markNotificationReadAction(row.id);
                    router.push(row.link);
                  },
                },
              });
            }

            const result = await fetchNotificationFeedAction();
            if (result.ok && result.data) setFeed(result.data);
          },
        )
        .subscribe();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={feed.unread > 0 ? `Notifications, ${feed.unread} unread` : "Notifications"}
        className="relative inline-flex size-10 items-center justify-center rounded-full text-white transition-colors outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-ring/60 lg:text-foreground lg:hover:bg-muted"
      >
        <BellIcon className="size-5" />
        {feed.unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.7rem] leading-5 font-bold text-white ring-2 ring-sidebar lg:ring-background">
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(26rem,calc(100vw-1.5rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="font-heading font-bold">Notifications</p>
          <button
            type="button"
            onClick={markAll}
            disabled={feed.unread === 0}
            className="text-sm font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
          >
            Mark all as read
          </button>
        </div>

        {feed.items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-[min(26rem,60dvh)] divide-y overflow-y-auto">
            {feed.items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onOpen={openItem} />
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-3 text-center text-sm font-medium hover:bg-muted"
        >
          See all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
