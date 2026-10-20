import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { loadSessionProfile, mfaPending } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import { ROLE_HOME } from "@/lib/roles";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-step verification" };

/** Step two of a password sign-in for someone who turned on two-step verification. */
export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const profile = await loadSessionProfile();
  if (!profile) redirect("/login");
  // Nothing to verify (two-step is off, or this session already passed it, or it came from Google): carry on.
  if (!(await mfaPending(profile))) redirect(ROLE_HOME[profile.role]);

  const params = await searchParams;
  const next = typeof params.next === "string" ? (safeNext(params.next) ?? undefined) : undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Brand className="mb-10" />
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary">
          <ShieldCheckIcon className="size-6" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Two-step verification</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          Open your authenticator app and type the 6-digit code for Elevate Campus Hub.
        </p>
        <VerifyForm next={next} />
        <p className="mt-6 text-sm text-muted-foreground">
          Lost your phone? Ask your Campus Head or IT to reset your two-step verification.
        </p>
        <form action="/auth/signout" method="post" className="mt-4">
          <Button type="submit" variant="ghost" size="sm" className="-ml-2.5">
            Use a different account
          </Button>
        </form>
      </div>
    </main>
  );
}
