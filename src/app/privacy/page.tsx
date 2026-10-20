import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { PrivacyNotice } from "@/components/privacy/privacy-notice";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Data Privacy Notice" };

// Public on purpose: people must be able to read it before they have an account.
export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-sidebar text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Elevate Campus Hub home">
            <Brand tone="dark" />
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: "default" }), "font-bold")}>
            Sign in
          </Link>
        </div>
        <div className="h-1 bg-brand" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="display text-3xl sm:text-4xl">Data Privacy Notice</h1>
        <div className="mt-6">
          <PrivacyNotice />
        </div>
      </main>

      <footer className="bg-sidebar text-white/70">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 text-sm sm:px-8">Change the campus one student at a time.</div>
      </footer>
    </div>
  );
}
