import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getSessionProfile } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose your password" };

export default async function SetPasswordPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");

  // First-time setup (or a new notice version) also asks the person to accept the Data Privacy Notice.
  const needsPrivacy = profile.privacy_accepted_version !== PRIVACY_VERSION;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Brand className="mb-10" />
        <h1 className="text-3xl font-extrabold tracking-tight">Choose your password</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          Hi {profile.first_name}. You&apos;ll use this password with {profile.email} every time you sign in.
        </p>
        <SetPasswordForm role={profile.role} needsPrivacy={needsPrivacy} />
      </div>
    </main>
  );
}
