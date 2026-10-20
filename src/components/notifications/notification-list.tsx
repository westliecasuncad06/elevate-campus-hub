"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import type { NotificationItem } from "@/lib/notifications";
import { NotificationRow } from "./notification-row";

/** The full notifications page: same rows as the bell, with a "mark all as read" button. */
export function NotificationList({ initial }: { initial: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((i) => !i.isRead).length;

  function open(item: NotificationItem) {
    if (!item.isRead) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
      void markNotificationReadAction(item.id);
    }
    router.push(item.link);
  }

  function markAll() {
    setItems((list) => list.map((i) => ({ ...i, isRead: true })));
    void markAllNotificationsReadAction().then(() => router.refresh());
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "Everything is read"}</p>
        <Button variant="outline" size="sm" onClick={markAll} disabled={unread === 0}>
          <CheckCheckIcon />
          Mark all as read
        </Button>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <NotificationRow item={item} onOpen={open} />
          </li>
        ))}
      </ul>
    </>
  );
}
