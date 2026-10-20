"use client";

import {
  ClipboardCheckIcon,
  HeartHandshakeIcon,
  LayersIcon,
  MailCheckIcon,
  MessageCircleIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time-ago";
import type { NotificationItem, NotificationType } from "@/lib/notifications";

const ICON: Record<NotificationType, LucideIcon> = {
  chat: MessageCircleIcon,
  assignment: UserCheckIcon,
  attendance: ClipboardCheckIcon,
  batch: LayersIcon,
  engagement: HeartHandshakeIcon,
  invitation: MailCheckIcon,
  system: TriangleAlertIcon,
};

/** One notification. Clicking it opens whatever it's about (the parent handles the navigation). */
export function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const Icon = ICON[item.type];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        !item.isRead && "bg-accent/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
          item.isRead ? "bg-muted text-muted-foreground" : "bg-foreground text-background",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", item.isRead ? "font-medium" : "font-bold")}>
          {item.title}
          {item.count > 1 ? <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[0.7rem] font-bold text-white">×{item.count}</span> : null}
        </span>
        {item.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.body}</span> : null}
        <span className="mt-1 block text-xs text-muted-foreground" suppressHydrationWarning>
          {timeAgo(item.createdAt)}
        </span>
      </span>
      {!item.isRead ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
    </button>
  );
}
