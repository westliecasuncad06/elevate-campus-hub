"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { LoadingOverlay } from "@/components/elevate-loader";
import { useFormAction } from "@/components/use-form-action";
import type { ActionResult } from "@/lib/types";
import { sendEmailCodeAction, verifyEmailCodeAction } from "./actions";

/** The second sign-in step for people who get a code by email. */
export function EmailCodeForm({
  maskedEmail,
  codeSent,
  justSent,
  next,
}: {
  maskedEmail: string;
  /** A code is already on its way (just sent when they signed in, or still valid). */
  codeSent: boolean;
  /** It was emailed a moment ago (as part of signing in), so a new one has to wait a little. */
  justSent: boolean;
  next?: string;
}) {
  const { state, pending, formProps } = useFormAction(verifyEmailCodeAction);
  const [sent, setSent] = useState(codeSent);
  const [sending, startSending] = useTransition();
  const [sendResult, setSendResult] = useState<ActionResult | null>(null);
  const [cooldown, setCooldown] = useState(justSent ? 30 : 0);

  // "Send a new code" is held back for 30 seconds after one was sent (the server enforces it too).
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function send() {
    setSendResult(null);
    startSending(async () => {
      const result = await sendEmailCodeAction();
      setSendResult(result);
      if (result.ok) {
        setSent(true);
        setCooldown(30);
        toast.success("We sent a new code to your email.");
      }
    });
  }

  return (
    <div className="grid gap-5">
      {sent ? (
        <form {...formProps} className="grid gap-4">
          {pending ? <LoadingOverlay label="Signing you in" /> : null}
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            hint={`We emailed it to ${maskedEmail}. It works for 10 minutes.`}
            className="[&_input]:text-center [&_input]:font-mono [&_input]:text-2xl [&_input]:tracking-[0.4em]"
            required
            autoFocus
          />
          <FormMessage state={state} />
          <SubmitButton size="lg" pending={pending} pendingText="Checking…">
            Verify and continue
          </SubmitButton>
        </form>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">We will email a 6-digit code to {maskedEmail}.</p>
          <Button size="lg" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Email me a code"}
          </Button>
        </div>
      )}

      <div className="grid gap-2 text-sm">
        {sent ? (
          <p className="text-muted-foreground">
            No email yet? Check your spam folder.{" "}
            <button
              type="button"
              onClick={send}
              disabled={sending || cooldown > 0}
              className="font-medium text-foreground underline underline-offset-4 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : sending ? "Sending…" : "Send a new code"}
            </button>
          </p>
        ) : null}
        <FormMessage state={sendResult && !sendResult.ok ? sendResult : null} />
      </div>
    </div>
  );
}
