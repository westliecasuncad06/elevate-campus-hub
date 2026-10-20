"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

/**
 * Submit button that disables itself and shows a spinner while the form is submitting.
 * Pass `pending` (from useFormAction) for forms submitted via onSubmit; plain `action` forms
 * and GET forms are picked up automatically.
 */
export function SubmitButton({
  children,
  pendingText,
  pending: pendingProp,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" {...props} disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Labelled input with an optional hint. A password field gets an eye button on the right to show or hide what was
 * typed (so a typo can be spotted before signing in), on every form that has one.
 */
export function Field({
  label,
  name,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string; hint?: string }) {
  const id = React.useId();
  const [revealed, setRevealed] = React.useState(false);
  const isPassword = props.type === "password";

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {isPassword ? (
        <div className="relative">
          <Input
            id={id}
            name={name}
            {...props}
            type={revealed ? "text" : "password"}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            title={revealed ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        </div>
      ) : (
        <Input id={id} name={name} {...props} />
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Labelled select that submits with the surrounding <form> (via the `name` prop). */
export function FormSelect({
  label,
  name,
  options,
  defaultValue,
  placeholder = "Select…",
  required,
  className,
  onValueChange,
}: {
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const id = React.useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select
        name={name}
        items={options}
        defaultValue={defaultValue}
        required={required}
        onValueChange={(v) => onValueChange?.((v as string | null) ?? "")}
      >
        <SelectTrigger id={id} className="w-full" aria-label={label || name}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Inline result message for a form action. */
export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
        {state.message}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}
