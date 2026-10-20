"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { CheckIcon, CopyIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { confirmTwoStepAction, disableTwoStepAction, startTwoStepAction } from "@/app/actions/two-step";
import { Field, FormMessage } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";

type Setup = { factorId: string; uri: string; secret: string };

/** The person's own switch for two-step verification: turn on (scan a QR code, type the first code) and turn off. */
export function TwoStepCard({ enabled, viaGoogle }: { enabled: boolean; viaGoogle: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<ActionResult<unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  function run(task: () => Promise<ActionResult | ActionResult<Setup>>, onDone?: (result: ActionResult | ActionResult<Setup>) => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setMessage(result);
        return;
      }
      onDone?.(result);
    });
  }

  function begin() {
    run(startTwoStepAction, (result) => {
      setSetup((result as { data?: Setup }).data ?? null);
      setCode("");
    });
  }

  function confirm() {
    if (!setup) return;
    run(() => confirmTwoStepAction(setup.factorId, code), (result) => {
      toast.success(result.ok ? (result.message ?? "Two-step verification is on.") : "");
      setSetup(null);
      setCode("");
      router.refresh();
    });
  }

  function turnOff() {
    run(() => disableTwoStepAction(code), (result) => {
      toast.success(result.ok ? (result.message ?? "Two-step verification is off.") : "");
      setTurningOff(false);
      setCode("");
      router.refresh();
    });
  }

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the key is on screen to type by hand.
    }
  }

  return (
    <section aria-labelledby="two-step-heading" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
            {enabled ? <ShieldCheckIcon className="size-5" /> : <ShieldOffIcon className="size-5 text-muted-foreground" />}
          </div>
          <div>
            <h2 id="two-step-heading" className="text-lg font-semibold">
              Two-step verification
            </h2>
            <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              When you sign in with your email and password, you also type a 6-digit code from an authenticator app on your phone. Someone who
              learns your password still can&apos;t get in.
            </p>
          </div>
        </div>
        {enabled ? (
          <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">On</Badge>
        ) : (
          <Badge variant="outline">Off</Badge>
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Signing in with Google stays easy: it doesn&apos;t ask for this code{viaGoogle ? " (you are signed in with Google now)" : ""}.
      </p>

      {!enabled && !setup ? (
        <div className="mt-4">
          <Button onClick={begin} disabled={pending}>
            {pending ? "Starting…" : "Turn on two-step verification"}
          </Button>
          <div className="mt-3">
            <FormMessage state={message} />
          </div>
        </div>
      ) : null}

      {setup ? (
        <div className="mt-5 grid gap-5 rounded-xl border bg-background p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="mx-auto rounded-lg bg-white p-3">
            <QRCodeSVG value={setup.uri} size={168} marginSize={0} title="Scan with your authenticator app" />
          </div>
          <div className="grid gap-3">
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
              <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
              <li>Scan this QR code with it. Can&apos;t scan? Type this key instead:</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm break-all select-all">{setup.secret}</code>
              <Button type="button" variant="outline" size="icon" onClick={copySecret} aria-label="Copy the key">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </div>
            <Field
              label="Then type the 6-digit code your app shows"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="[&_input]:font-mono [&_input]:tracking-widest"
            />
            <FormMessage state={message} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirm} disabled={pending || code.replace(/\s/g, "").length !== 6}>
                {pending ? "Checking…" : "Verify and turn on"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                  setMessage(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {enabled && !turningOff ? (
        <div className="mt-4">
          <Button variant="outline" onClick={() => setTurningOff(true)}>
            Turn off
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Lost your phone? Ask your Campus Head or IT to reset it, then turn it on again with your new phone.
          </p>
        </div>
      ) : null}

      {enabled && turningOff ? (
        <div className="mt-4 grid max-w-sm gap-3">
          <Field
            label="Type a current 6-digit code to turn it off"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="[&_input]:font-mono [&_input]:tracking-widest"
          />
          <FormMessage state={message} />
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={turnOff} disabled={pending || code.replace(/\s/g, "").length !== 6}>
              {pending ? "Turning off…" : "Turn off two-step verification"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTurningOff(false);
                setCode("");
                setMessage(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
