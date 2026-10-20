import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PrivacyNotice } from "@/components/privacy/privacy-notice";
import { getSessionProfile, requireMfaStep } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { ROLE_HOME } from "@/lib/roles";
import { AcceptPrivacyForm } from "./accept-form";

export const metadata: Metadata = { title: "Data Privacy Notice" };

/** Shown once to anyone who hasn't accepted the current notice yet (existing accounts, or after the notice changes). */
export default async function AcceptPrivacyPage() {
  await requireMfaStep();
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");
  if (!profile.password_changed) redirect("/set-password");
  if (profile.privacy_accepted_version === PRIVACY_VERSION) redirect(ROLE_HOME[profile.role]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <Brand className="mb-8" />
      <h1 className="text-3xl font-extrabold tracking-tight">Before you continue</h1>
      <p className="mt-2 text-muted-foreground">
        Hi {profile.first_name}. Please read how we use your data and accept it to keep using Elevate Campus Hub. You only
        need to do this once.
      </p>

      <div className="mt-6 max-h-[28rem] overflow-y-auto rounded-2xl border bg-card p-5 sm:p-7" tabIndex={0} aria-label="Data Privacy Notice">
        <PrivacyNotice />
      </div>

      <div className="mt-6">
        <AcceptPrivacyForm role={profile.role} />
      </div>
    </main>
  );
}
