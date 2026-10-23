"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, MailCheckIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { saveSecuritySettingsAction, sendTestCodeAction, verifyTestCodeAction } from "@/app/actions/security-settings";
import { Field, FormMessage, FormSelect, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/use-form-action";
import type { ActionResult, Role } from "@/lib/types";

const GROUPS: { role: Role; label: string; hint: string }[] = [
  { role: "student", label: "Students", hint: "Recommended: they have no authenticator app." },
  { role: "facilitator", label: "Facilitators", hint: "" },
  { role: "campus_head", label: "Campus Heads", hint: "" },
  { role: "super_admin", label: "Super Admins", hint: "Only if email is reliable: it's how you'd sign in to fix a problem. Google sign-in always works." },
];

const HOUR_OPTIONS = [1, 2, 3, 5, 8, 12, 24, 48, 72, 168].map((h) => ({
  value: String(h),
  label: h === 168 ? "7 days" : h === 24 ? "24 hours" : h === 48 ? "2 days" : h === 72 ? "3 days" : `${h} hour${h === 1 ? "" : "s"}`,
}));

/** The Super Admin's switch for "ask for a code from your email when signing in with a password". */
export function SecuritySettingsForm({
  enabled,
  roles,
  hours,
  testPassed,
  mailer,
  adminEmail,
}: {
  enabled: boolean;
  roles: Role[];
  hours: number;
  /** A test code was typed correctly in the last 24 hours. */
  testPassed: boolean;
  mailer: { configured: boolean; provider: string | null; problem: string | null };
  adminEmail: string;
}) {
  const router = useRouter();
  const { state, pending, formProps } = useFormAction(saveSecuritySettingsAction);
  const [testSent, setTestSent] = useState(false);
  const [code, setCode] = useState("");
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [working, startWork] = useTransition();

  function run(task: () => Promise<ActionResult>, after?: () => void) {
    setTestResult(null);
    startWork(async () => {
      const result = await task();
      setTestResult(result);
      if (result.ok) after?.();
    });
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <section className="rounded-2xl border bg-card p-5" aria-labelledby="mail-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="mail-heading" className="text-lg font-semibold">
              1. Email sending
            </h2>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Codes are emailed through a free email service (Brevo or Resend). Supabase&apos;s own sender is too limited for sign-in codes.
            </p>
          </div>
          {mailer.configured ? (
            <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
              Ready{mailer.provider === "dev" ? " (development: printed to the log)" : mailer.provider ? ` (${mailer.provider})` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Not set up</Badge>
          )}
        </div>
        {!mailer.configured ? (
          <div className="mt-3 flex gap-2 rounded-lg bg-brand/20 px-3 py-2.5 text-sm text-brand-ink">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{mailer.problem}</p>
              <p className="mt-1">
                Easiest: make a free Brevo account, verify your sender email (Senders &amp; IP), create an API key, then add <code>BREVO_API_KEY</code> and{" "}
                <code>EMAIL_FROM</code> (like <code>Elevate Campus Hub &lt;you@gmail.com&gt;</code>) in Vercel and redeploy. Steps are in SECURITY.md.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="test-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="test-heading" className="text-lg font-semibold">
              2. Send yourself a test code
            </h2>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Proves that emails really arrive, so nobody is locked out when you switch the step on. It goes to {adminEmail}.
            </p>
          </div>
          {testPassed ? (
            <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2Icon /> Tested
            </Badge>
          ) : null}
        </div>
        <div className="mt-4 grid max-w-sm gap-3">
          <Button
            variant="outline"
            disabled={!mailer.configured || working}
            onClick={() => run(sendTestCodeAction, () => setTestSent(true))}
          >
            <MailCheckIcon />
            {working && !testSent ? "Sending…" : testSent ? "Send another test code" : "Send me a test code"}
          </Button>
          {testSent ? (
            <>
              <Field
                label="Type the code from the email"
                name="test-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="[&_input]:font-mono [&_input]:tracking-widest"
              />
              <Button
                disabled={working || code.replace(/\D/g, "").length !== 6}
                onClick={() =>
                  run(() => verifyTestCodeAction(code), () => {
                    toast.success("Email works.");
                    setCode("");
                    setTestSent(false);
                    router.refresh();
                  })
                }
              >
                Check the code
              </Button>
            </>
          ) : null}
          <FormMessage state={testResult} />
        </div>
      </section>

      <form {...formProps} className="rounded-2xl border bg-card p-5" aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="text-lg font-semibold">
          3. Ask for a code when signing in with a password
        </h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
          After the password, we email a 6-digit code. A browser that passed the check isn&apos;t asked again until the hours below are over, and a
          session that stays open that long is asked again. <strong>Continue with Google is never asked</strong>, and people who turned on an
          authenticator app use that instead.
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-[var(--primary)]" />
          Ask for the emailed code
        </label>

        <fieldset className="mt-4 grid gap-2.5 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Who is asked</legend>
          {GROUPS.map((g) => (
            <label key={g.role} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="roles"
                value={g.role}
                defaultChecked={roles.includes(g.role)}
                className="mt-0.5 size-5 accent-[var(--primary)]"
              />
              <span>
                {g.label}
                {g.hint ? <span className="block text-xs text-muted-foreground">{g.hint}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>

        <FormSelect
          label="A check lasts"
          name="hours"
          options={HOUR_OPTIONS}
          defaultValue={String(hours)}
          className="mt-4 max-w-56"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Shorter is safer but sends more emails (the free plans allow about 300 a day with Brevo).
        </p>

        <div className="mt-4">
          <FormMessage state={state} />
        </div>
        <SubmitButton className="mt-3" pending={pending} pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
    </div>
  );
}
