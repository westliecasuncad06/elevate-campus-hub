"use client";

import { useEffect, useState } from "react";
import { ElevateLoader } from "@/components/elevate-loader";

/** Long enough for one full draw of the mark, so a fast page doesn't just flash it. */
const MIN_MS = 1200;

/**
 * The full-screen logo animation shown whenever a page is opened or refreshed. It is part of the server's HTML, so it is
 * up from the very first paint, and fades out once the page is loaded and ready to use. (If scripts never run, a CSS
 * fallback in globals.css hides it after a few seconds, so the page is never stuck behind it.)
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    const started = performance.now();
    let leaveTimer: ReturnType<typeof setTimeout>;
    let goneTimer: ReturnType<typeof setTimeout>;

    const leave = () => {
      leaveTimer = setTimeout(
        () => {
          setPhase("leaving");
          goneTimer = setTimeout(() => setPhase("gone"), 400);
        },
        Math.max(0, MIN_MS - (performance.now() - started)),
      );
    };

    if (document.readyState === "complete") leave();
    else window.addEventListener("load", leave, { once: true });
    return () => {
      window.removeEventListener("load", leave);
      clearTimeout(leaveTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div
      aria-hidden={phase === "leaving"}
      className={`elevate-splash fixed inset-0 z-[100] grid place-items-center bg-background px-4 transition-opacity duration-400 ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <ElevateLoader label="Loading" />
    </div>
  );
}
