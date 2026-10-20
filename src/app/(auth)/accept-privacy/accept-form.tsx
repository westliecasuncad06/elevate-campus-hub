"use client";

import { FormMessage, SubmitButton } from "@/components/forms";
import { PrivacyConsent } from "@/components/privacy/privacy-consent";
import { useFormAction } from "@/components/use-form-action";
import type { Role } from "@/lib/types";
import { acceptPrivacyAction } from "./actions";

export function AcceptPrivacyForm({ role }: { role: Role }) {
  const { state, pending, formProps } = useFormAction(acceptPrivacyAction);

  return (
    <form {...formProps} className="grid gap-4">
      <PrivacyConsent role={role} mode="self" />
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pending={pending} pendingText="Saving…">
          Agree and continue
        </SubmitButton>
        {/* A plain POST form can't sit inside this one, so sign-out is a link to the GET handler. */}
        <a href="/auth/signout" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Sign out instead
        </a>
      </div>
    </form>
  );
}
