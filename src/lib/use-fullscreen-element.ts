"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/**
 * The element that is full screen right now (the kiosk), or null. While something is full screen the browser shows
 * only that element, so pop-ups (dropdown lists, menus, dialogs) must open inside it or they can't be seen or clicked.
 * Pass the result as a portal's `container`; null/undefined means the usual place (the page body).
 */
export function useFullscreenElement(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => (document.fullscreenElement as HTMLElement | null) ?? null,
    () => null,
  );
}
