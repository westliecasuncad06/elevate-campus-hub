"use client";

import { useEffect } from "react";
import Script from "next/script";

/**
 * Two cheap defences against bots on public forms.
 *
 * 1. A hidden "website" box. People never see or fill it; a bot that fills in every field does, and the server then
 *    answers as if the attempt had failed (see isBot() in src/lib/bot-guard.ts).
 * 2. An optional Cloudflare Turnstile check (a free CAPTCHA that usually needs no clicking). It appears only when
 *    NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, and the server must have TURNSTILE_SECRET_KEY to check the answer.
 */

export function Honeypot() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Leave this empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

/**
 * The Turnstile box. A check can only be used once, so pass something that changes after every attempt
 * (for example the action's result) as `resetKey` and a fresh one is shown after a failed try.
 */
export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== null) window.turnstile?.reset();
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      <div className="cf-turnstile" data-sitekey={SITE_KEY} data-theme="light" />
    </>
  );
}
