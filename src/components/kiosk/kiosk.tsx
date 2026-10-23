"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2Icon, MaximizeIcon, MinimizeIcon, UserPlusIcon } from "lucide-react";
import { AccountFields } from "@/components/accounts/account-fields";
import { Field, FormMessage, SubmitButton } from "@/components/forms";
import { StudentNumberField } from "@/components/student-number-field";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/use-form-action";
import { KioskLoader } from "./kiosk-loader";
import { kioskCheckInAction, kioskRegisterAction, type KioskKind, type KioskOutcome } from "@/app/actions/kiosk";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/types";

/** How long the welcome stays up before the kiosk is ready for the next student. */
const WELCOME_SECONDS = 4;

type Screen =
  | { step: "entry" }
  | { step: "welcome"; name: string }
  | { step: "ask"; kind: KioskKind; value: string }
  | { step: "register"; kind: KioskKind; value: string };

const KINDS: { id: KioskKind; label: string }[] = [
  { id: "student_number", label: "Student number" },
  { id: "phone", label: "Phone number" },
];

/**
 * The check-in kiosk: a laptop at the entrance where students type their student number (or phone number) to mark their
 * attendance. Known student: "Welcome" and their name. Unknown number: offer to create an account (yes or no), with the
 * number they typed already filled in. The Full screen button hides the rest of the app so students only see this.
 */
export function Kiosk({ programs, campusName }: { programs: Program[]; campusName: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [screen, setScreen] = useState<Screen>({ step: "entry" });

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      // The browser refused (some embedded browsers do): the kiosk still works in the page.
    }
  }

  const reset = useCallback(() => setScreen({ step: "entry" }), []);
  // While a check-in or a new account is being saved, the loader covers the kiosk (the form underneath keeps what was typed).
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div
      ref={frame}
      className={cn(
        "relative overflow-y-auto rounded-3xl border bg-background",
        fullscreen ? "flex min-h-screen flex-col justify-center rounded-none border-0 px-4 py-10" : "min-h-[32rem] px-4 py-10 sm:px-8",
      )}
    >
      <Button
        type="button"
        variant="outline"
        onClick={toggleFullscreen}
        className="absolute top-4 right-4"
        aria-pressed={fullscreen}
      >
        {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        {fullscreen ? "Exit full screen" : "Full screen"}
      </Button>

      {busy ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/90 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <KioskLoader label={busy} />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-2xl pt-8">
        <p className="text-center text-lg font-medium text-muted-foreground">{campusName}</p>
        {screen.step === "entry" ? (
          <EntryScreen onBusy={setBusy} onWelcome={(name) => setScreen({ step: "welcome", name })} onUnknown={(kind, value) => setScreen({ step: "ask", kind, value })} />
        ) : screen.step === "welcome" ? (
          <WelcomeScreen name={screen.name} onDone={reset} />
        ) : screen.step === "ask" ? (
          <AskScreen kind={screen.kind} onYes={() => setScreen({ step: "register", kind: screen.kind, value: screen.value })} onNo={reset} />
        ) : (
          <RegisterScreen
            kind={screen.kind}
            value={screen.value}
            programs={programs}
            onBusy={setBusy}
            onWelcome={(name) => setScreen({ step: "welcome", name })}
            onCancel={reset}
          />
        )}
      </div>
    </div>
  );
}

function EntryScreen({
  onBusy,
  onWelcome,
  onUnknown,
}: {
  onBusy: (label: string | null) => void;
  onWelcome: (name: string) => void;
  onUnknown: (kind: KioskKind, value: string) => void;
}) {
  const [kind, setKind] = useState<KioskKind>("student_number");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    onBusy(pending ? "Counting you in" : null);
    return () => onBusy(null);
  }, [pending, onBusy]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get(kind === "student_number" ? "student_number" : "phone") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await kioskCheckInAction(kind, raw);
      if (!result.ok) return setError(result.error);
      const outcome = result.data as KioskOutcome;
      if (outcome.status === "welcome") onWelcome(outcome.name);
      else onUnknown(outcome.kind, outcome.value);
    });
  }

  return (
    <div className="mt-2">
      <h1 className="text-center text-5xl font-bold tracking-tight text-balance sm:text-6xl">Welcome!</h1>
      <p className="mt-3 text-center text-xl text-muted-foreground">Type your {kind === "student_number" ? "student number" : "phone number"} to be counted in today.
      </p>

      <div role="tablist" aria-label="Count me in with" className="mx-auto mt-10 grid max-w-lg grid-cols-2 gap-1.5 rounded-2xl bg-muted p-1.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => {
              setKind(k.id);
              setError(null);
            }}
            className={cn(
              "rounded-xl px-4 py-4 text-lg font-semibold transition-colors",
              kind === k.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <form key={kind} onSubmit={submit} className="mx-auto mt-8 grid max-w-lg gap-5 [&_input]:h-16 [&_input]:rounded-xl [&_input]:px-5 [&_input]:text-3xl [&_input]:tracking-wide [&_label]:text-xl [&_p]:text-base">
        {kind === "student_number" ? (
          <StudentNumberField label="Your student number" autoFocus />
        ) : (
          <Field label="Your phone number" name="phone" type="tel" inputMode="tel" placeholder="09XX XXX XXXX" autoComplete="off" autoFocus required />
        )}
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-base text-destructive">
            {error}
          </p>
        ) : null}
        <SubmitButton size="lg" pending={pending} pendingText="Counting you in…" className="h-16 text-2xl">
          Count me in
        </SubmitButton>
      </form>
    </div>
  );
}

function WelcomeScreen({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, WELCOME_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div role="status" aria-live="polite" className="mt-6 text-center">
      <CheckCircle2Icon className="mx-auto size-20 text-success" aria-hidden="true" />
      <p className="mt-6 text-3xl font-medium text-muted-foreground">Welcome</p>
      <p className="mt-2 text-6xl leading-tight font-bold tracking-tight text-balance sm:text-7xl">{name}</p>
      <Button variant="outline" size="lg" className="mt-12 h-14 px-8 text-lg" onClick={onDone}>
        Next student
      </Button>
    </div>
  );
}

function AskScreen({ kind, onYes, onNo }: { kind: KioskKind; onYes: () => void; onNo: () => void }) {
  return (
    <div role="alert" className="mt-6 text-center">
      <UserPlusIcon className="mx-auto size-20 text-primary" aria-hidden="true" />
      <h1 className="mt-6 text-5xl font-bold tracking-tight text-balance">No account yet</h1>
      <p className="mx-auto mt-3 max-w-md text-xl text-muted-foreground">
        We couldn&apos;t find that {kind === "student_number" ? "student number" : "phone number"}. Would you like to create an
        account and be counted in today?
      </p>
      <div className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-4">
        <Button variant="outline" size="lg" className="h-16 text-2xl" onClick={onNo}>
          No
        </Button>
        <Button size="lg" className="h-16 text-2xl" onClick={onYes} autoFocus>
          Yes
        </Button>
      </div>
    </div>
  );
}

function RegisterScreen({
  kind,
  value,
  programs,
  onBusy,
  onWelcome,
  onCancel,
}: {
  kind: KioskKind;
  value: string;
  programs: Program[];
  onBusy: (label: string | null) => void;
  onWelcome: (name: string) => void;
  onCancel: () => void;
}) {
  const { state, pending, formProps } = useFormAction<KioskOutcome>(kioskRegisterAction.bind(null, kind, value));

  useEffect(() => {
    onBusy(pending ? "Creating your account" : null);
    return () => onBusy(null);
  }, [pending, onBusy]);

  useEffect(() => {
    if (state?.ok && state.data?.status === "welcome") onWelcome(state.data.name);
  }, [state, onWelcome]);

  // The number they already typed is filled in and locked; the other one is still theirs to type.
  const defaults = kind === "student_number" ? { student_number: value } : { phone: value };

  return (
    <form {...formProps} className="mt-4 grid gap-5 [&_input:not([type=checkbox])]:h-12 [&_input:not([type=checkbox])]:text-lg [&_label]:text-base">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Fill in your details. You&apos;ll be counted in right after, and we&apos;ll email you a link to set your password.
        </p>
      </div>
      <AccountFields role="student" programs={programs} defaults={defaults} lockedField={kind} consentMode="self" />
      <FormMessage state={state?.ok ? null : state} />
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton size="lg" pending={pending} pendingText="Creating your account…">
          Create account and count me in
        </SubmitButton>
      </div>
    </form>
  );
}
