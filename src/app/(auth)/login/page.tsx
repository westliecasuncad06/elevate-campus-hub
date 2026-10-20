import type { Metadata } from "next";
import Link from "next/link";
import { Brand, LogoMark } from "@/components/brand";
import { isGoogleLoginEnabled } from "@/lib/google-login";
import { GoogleButton } from "./google-button";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  inactive: "Your account was deactivated. Contact your Campus Head or IT.",
  no_profile: "This account no longer exists. Contact your Campus Head or IT if that's a mistake.",
  invite_expired: "That invitation link has expired or was already used. Ask your Campus Head to send a new invitation.",
  google_not_invited:
    "That Google account hasn't been invited yet. Ask your Campus Head to invite the email you use with Google, or sign in with your email and password.",
  google_failed: "Google sign-in didn't finish. Try again, or sign in with your email and password.",
  too_many: "Too many attempts from this connection. Please wait a few minutes and try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  const googleEnabled = await isGoogleLoginEnabled();

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <LogoMark className="pointer-events-none absolute top-[16%] -right-[6%] -z-10 h-auto w-[68%] text-brand" />
        <Link href="/" aria-label="Elevate Campus Hub home">
          <Brand tone="dark" size="lg" />
        </Link>
        <div className="max-w-md">
          <p className="display text-4xl leading-[1.05] text-balance">Change the campus one student at a time.</p>
          <p className="mt-5 text-white/70">
            Check students in, record who you talked with, and send the weekly report from one place.
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center bg-card px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" aria-label="Elevate Campus Hub home" className="mb-10 inline-block lg:hidden">
            <Brand tone="light" />
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">Sign in</h1>
          <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
            Use the email your Campus Head or IT registered for you.
          </p>
          {notice ? (
            <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {notice}
            </p>
          ) : null}
          {googleEnabled ? (
            <>
              <GoogleButton next={next} />
              <p className="mt-2 text-xs text-muted-foreground">
                Use the Google account that matches your invited email.
              </p>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or use your email and password
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <LoginForm next={next} />
          <p className="mt-6 text-sm text-muted-foreground">
            Got an invitation code?{" "}
            <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
              Register here
            </Link>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Forgot your password? Ask IT to reset it for you.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Data Privacy Notice
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
