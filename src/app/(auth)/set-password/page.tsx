import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getSessionProfile, isGoogleSession, requireMfaStep } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { getActivePrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose your password" };

export default async function SetPasswordPage() {
  await requireMfaStep();
  const profile = await getSessionProfile();
  if (!profile) redirect("/auth/signout?reason=no_profile");

  // First-time setup (or a new notice version) also asks the person to accept the Data Privacy Notice.
  const needsPrivacy = profile.privacy_accepted_version !== PRIVACY_VERSION;
  // Someone invited by email only tells us who they are here.
  const needsDetails = !profile.details_complete;
  // Signed in with Google: that already proves who they are, so a password is optional.
  const viaGoogle = await isGoogleSession();
  // A student invited by email picks their program (or types their course) here, from their own campus's list.
  const programs =
    profile.role === "student" && needsDetails ? await getActivePrograms(await createClient(), profile.campus_id) : [];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className={profile.role === "student" && needsDetails ? "w-full max-w-xl" : "w-full max-w-md"}>
        <Brand className="mb-10" />
        <h1 className="text-3xl font-extrabold tracking-tight">
          {needsDetails ? "Complete your registration" : viaGoogle ? "Almost there" : "Choose your password"}
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          {viaGoogle
            ? needsDetails
              ? `Welcome! Tell us about yourself. You signed in with Google (${profile.email}), so you don't need a password.`
              : `Hi ${profile.first_name}. You signed in with Google (${profile.email}), so you don't need a password.`
            : needsDetails
              ? `Welcome! Tell us about yourself and choose a password. You'll use it with ${profile.email} every time you sign in.`
              : `Hi ${profile.first_name}. You'll use this password with ${profile.email} every time you sign in.`}
        </p>
        <SetPasswordForm
          role={profile.role}
          needsPrivacy={needsPrivacy}
          needsDetails={needsDetails}
          passwordOptional={viaGoogle}
          programs={programs}
        />
      </div>
    </main>
  );
}
