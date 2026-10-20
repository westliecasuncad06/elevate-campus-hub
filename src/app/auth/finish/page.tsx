"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Finishes sign-in for email links that carry their session in the URL fragment
 * (#access_token=...&refresh_token=...), then sends the person to choose a password.
 * Anything else (expired or already-used link) goes back to the login page with a clear message.
 */
export default function FinishPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!cancelled && !error) {
          // Drop the tokens from the address bar before moving on.
          window.history.replaceState(null, "", window.location.pathname);
          router.replace("/set-password");
          return;
        }
      }
      if (!cancelled) router.replace("/login?error=invite_expired");
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2Icon className="size-8 animate-spin text-primary" />
      <p className="font-medium">Signing you in…</p>
      <p className="text-sm text-muted-foreground">You&apos;ll choose your password next.</p>
    </main>
  );
}
