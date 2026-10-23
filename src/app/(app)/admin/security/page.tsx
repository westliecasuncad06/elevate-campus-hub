import type { Metadata } from "next";
import { SecuritySettingsForm } from "@/components/admin/security-settings-form";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { getSecuritySettings } from "@/lib/email-code";
import { isWithinHours } from "@/lib/email-code-core";
import { mailerStatus } from "@/lib/mailer";

export const metadata: Metadata = { title: "Security" };

/** Super Admin: the emailed sign-in code (who is asked, and for how long a check lasts). */
export default async function SecurityPage() {
  const actor = await requireRole("super_admin");
  const settings = await getSecuritySettings();
  const mailer = mailerStatus();

  return (
    <>
      <PageHeader
        title="Security"
        description="Ask for a 6-digit code from the person's email when they sign in with their password. Signing in with Google stays easy."
      />
      <SecuritySettingsForm
        enabled={settings.enabled}
        roles={settings.roles}
        hours={settings.hours}
        testPassed={Boolean(settings.testOkAt && isWithinHours(settings.testOkAt, 24))}
        mailer={mailer}
        adminEmail={actor.email}
      />
    </>
  );
}
