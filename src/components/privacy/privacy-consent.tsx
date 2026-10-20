import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { collectedFor, SEE_SUMMARY } from "@/lib/privacy";
import type { Role } from "@/lib/types";

/**
 * The short Data Privacy summary with a required consent checkbox (name="privacy_consent").
 *
 *  - mode "register": a facilitator / Campus Head / Super Admin is entering someone else's details, so they confirm
 *    on the person's behalf that the person (or their parent/guardian if under 18) has been told and agrees.
 *  - mode "self": the person is setting up or re-confirming their own account.
 */
export function PrivacyConsent({
  role,
  mode,
  className,
}: {
  role: Role;
  mode: "register" | "self";
  className?: string;
}) {
  const isStudent = role === "student";

  return (
    <fieldset className={`rounded-2xl border bg-muted/50 p-4 ${className ?? ""}`}>
      <legend className="sr-only">Data privacy</legend>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <ShieldCheckIcon className="size-5" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-heading text-base font-bold">Data privacy</p>
          <p className="mt-1 text-muted-foreground">
            {mode === "register" ? "We collect" : "We keep"} {collectedFor(role)}
          </p>
          <p className="mt-1.5 text-muted-foreground">
            We use {mode === "register" ? "it" : "them"} to check {isStudent ? "students" : "people"} in, follow up with them, pair same-gender
            facilitators and chat, and report totals (not names) to our ministry. {SEE_SUMMARY}
          </p>
          <p className="mt-1.5">
            <Link href="/privacy" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
              Read the full Data Privacy Notice
            </Link>
          </p>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-snug">
        <input type="checkbox" name="privacy_consent" required className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        {mode === "register" ? (
          <span>
            I confirm that <strong>{isStudent ? "the student" : "this person"}</strong> has read the Data Privacy Notice (or it was read to
            them) and agrees to the collection and use of their data for the purposes above.
            {isStudent ? " If the student is under 18, their parent or guardian agrees." : ""}
          </span>
        ) : (
          <span>
            I have read the Data Privacy Notice and I agree to the collection and use of my data for the purposes above.
            {isStudent ? " If I am under 18, my parent or guardian agrees." : ""}
          </span>
        )}
      </label>
    </fieldset>
  );
}
