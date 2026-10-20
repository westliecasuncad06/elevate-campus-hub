import type { Metadata } from "next";
import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { TwoStepCard } from "@/components/account/two-step-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { isGoogleSession, requireProfile } from "@/lib/auth";
import { fullName } from "@/lib/types";

export const metadata: Metadata = { title: "Account & security" };

/** Everyone's own settings: who they are, their password, and two-step verification. */
export default async function AccountPage() {
  const profile = await requireProfile();
  const viaGoogle = await isGoogleSession();

  return (
    <>
      <PageHeader title="Account & security" description={`${fullName(profile)} · ${profile.email}`} />

      <div className="grid max-w-3xl gap-6">
        <TwoStepCard enabled={profile.mfa_enabled} viaGoogle={viaGoogle} />

        <section aria-labelledby="password-heading" className="rounded-2xl border bg-card p-5">
          <h2 id="password-heading" className="text-lg font-semibold">
            Password
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Use at least 10 characters that only you would think of. Don&apos;t reuse a password from another site.
          </p>
          <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/set-password" />}>
            <KeyRoundIcon />
            Change password
          </Button>
        </section>
      </div>
    </>
  );
}
