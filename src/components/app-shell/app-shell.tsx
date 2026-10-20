"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EllipsisIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { AddBatchButton } from "@/components/batch/add-batch-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/roles";
import type { NotificationFeed } from "@/lib/notifications";
import type { Role } from "@/lib/types";
import { NAV, type NavItem } from "./nav-config";

export interface BatchNavData {
  /** Where Today lives (/facilitator or /campus-head). */
  basePath: string;
  batches: { id: string; number: number; pending: number }[];
  /** The batch Today shows when the URL doesn't name one. */
  defaultId: string | null;
}

interface AppShellProps {
  role: Role;
  userId: string;
  userName: string;
  campusLabel: string;
  unreadChat: number;
  batchNav: BatchNavData | null;
  notifications: NotificationFeed;
  children: React.ReactNode;
}

/** Desktop only: the open batches under "Today", plus the button to add another. */
function BatchSubNav({ data }: { data: BatchNavData }) {
  const pathname = usePathname();
  const requested = useSearchParams().get("batch");
  const onToday = pathname === data.basePath;
  const currentId = requested ?? data.defaultId;

  return (
    <div className="mt-0.5 mb-1 ml-5 grid gap-0.5 border-l border-sidebar-border pl-3">
      {data.batches.map((b) => {
        const active = onToday && b.id === currentId;
        return (
          <Link
            key={b.id}
            href={`${data.basePath}?batch=${b.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            Batch {b.number}
            {b.pending > 0 ? (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                {b.pending}
              </span>
            ) : null}
          </Link>
        );
      })}
      <AddBatchButton
        basePath={data.basePath}
        label={data.batches.length ? "Add another batch" : "Start engage"}
        pendingBatches={data.batches}
        variant="sidebar"
        className="text-brand hover:bg-white/10"
      />
    </div>
  );
}

function isActive(pathname: string, item: NavItem, items: NavItem[]) {
  // The longest matching href wins so "/facilitator" isn't active on "/facilitator/chat".
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const best = matches.sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === item.href;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SignOutForm({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white",
          className,
        )}
      >
        <LogOutIcon className="size-4" />
        Sign out
      </button>
    </form>
  );
}

export function AppShell({ role, userId, userName, campusLabel, unreadChat, batchNav, notifications, children }: AppShellProps) {
  const pathname = usePathname();
  const items = NAV[role];
  const [moreOpen, setMoreOpen] = useState(false);

  // Phones get a bottom bar: up to 4 destinations plus an always-present "More" sheet that
  // holds the remaining destinations, Change password and Sign out.
  const bottomItems = items.slice(0, 4);
  const overflowItems = items.slice(4);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* Desktop sidebar: black, with the red mark */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <Brand tone="dark" className="px-2 pt-2 pb-8" />
        <nav className="grid gap-1" aria-label="Main">
          {items.map((item) => {
            const active = isActive(pathname, item, items);
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "bg-sidebar-accent text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand" aria-hidden="true" /> : null}
                  <item.icon className={cn("size-4", active && "text-brand")} />
                  {item.label}
                  {item.chat ? <Badge count={unreadChat} /> : null}
                </Link>
                {item.batches && batchNav ? (
                  <Suspense fallback={null}>
                    <BatchSubNav data={batchNav} />
                  </Suspense>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-1 border-t border-sidebar-border pt-3">
          <Link
            href="/set-password"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <KeyRoundIcon className="size-4" />
            Change password
          </Link>
          <SignOutForm />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Black bar on phones, light bar on desktop */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-sidebar px-4 py-2.5 text-white lg:border-b lg:bg-background/90 lg:px-8 lg:text-foreground lg:backdrop-blur">
          <Brand tone="dark" className="lg:hidden [&_p:first-child]:text-base" />
          <p className="hidden text-sm text-muted-foreground lg:block">{campusLabel}</p>
          <div className="flex items-center gap-3">
            <NotificationBell userId={userId} initial={notifications} />
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{userName}</p>
              <p className="text-xs text-white/60 lg:text-muted-foreground">
                {ROLE_LABEL[role]}
                <span className="lg:hidden"> · {campusLabel.split(" · ")[0]}</span>
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}
      >
        {bottomItems.map((item) => {
          const active = isActive(pathname, item, items);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[0.7rem] font-medium",
                active ? "text-white" : "text-white/55",
              )}
            >
              {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-brand" aria-hidden="true" /> : null}
              <item.icon className={cn("size-5", active && "text-brand")} />
              <span className="max-w-full truncate">{item.label}</span>
              {item.chat && unreadChat > 0 ? (
                <span className="absolute top-1.5 left-1/2 ml-2 inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.65rem] font-bold text-white">
                  {unreadChat > 9 ? "9+" : unreadChat}
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[0.7rem] font-medium text-white/55"
        >
          <EllipsisIcon className="size-5" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-sidebar text-white lg:hidden">
          <SheetHeader>
            <SheetTitle className="text-white">More</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 px-4 pb-6">
            {overflowItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            <Link
              href="/notifications"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              <KeyRoundIcon className="size-4 opacity-0" aria-hidden="true" />
              All notifications
            </Link>
            <Link
              href="/set-password"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              <KeyRoundIcon className="size-4" />
              Change password
            </Link>
            <SignOutForm className="py-3" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
