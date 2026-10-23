import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { loadSessionProfile, secondStep } from "@/lib/auth";
import { maskEmail } from "@/lib/email-code-core";
import { hasActiveCode } from "@/lib/email-code";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import { EmailCodeForm } from "./email-code-form";

export const metadata: Metadata = { title: "Enter your code" };

/** Step two of a password sign-in when the school asks for a code by email (turned on by the Super Admin). */
export default async function EmailCodePage({ searchParams }: PageProps<"/login/email-code">) {
  const profile = await loadSessionProfile();
  if (!profile) redirect("/login");

  const step = await secondStep(profile);
  if (step === "totp") redirect("/login/verify");
  // Nothing owed (the step is off, this session already passed it, or it came from Google): carry on.
  if (step === null) redirect(ROLE_HOME[profile.role]);

  const params = await searchParams;
  const next = typeof params.next === "string" ? (safeNext(params.next) ?? undefined) : undefined;
  // ?sent=1 means a code was emailed a moment ago, as part of signing in.
  const justSent = params.sent === "1";
  const codeSent = justSent || (await hasActiveCode(profile.id));

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Brand className="mb-10" />
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
          <MailCheckIcon className="size-6" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Check your email</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          To keep your account safe, we ask for a code from your email when you sign in with your password. Signing in with Google skips this step.
        </p>
        {params.sent === "0" ? (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            We couldn&apos;t send the email just now. Press the button to try again.
          </p>
        ) : null}
        <EmailCodeForm maskedEmail={maskEmail(profile.email)} codeSent={codeSent} justSent={justSent} next={next} />
        <form action="/auth/signout" method="post" className="mt-6">
          <Button type="submit" variant="ghost" size="sm" className="-ml-2.5">
            Use a different account
          </Button>
        </form>
      </div>
    </main>
  );
}
