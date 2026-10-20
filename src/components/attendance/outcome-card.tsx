import { CheckCircle2Icon, TriangleAlertIcon, UserCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttendanceOutcome } from "@/app/actions/attendance";

/** What the facilitator sees right after a student is added: big name, what happened, what to do next. */
export function OutcomeCard({
  outcome,
  onNext,
  nextLabel = "Add next student",
}: {
  outcome: AttendanceOutcome;
  onNext: () => void;
  nextLabel?: string;
}) {
  const { student } = outcome;
  const already = outcome.action === "already_in_batch";

  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
          already ? "bg-brand/25 text-brand-ink" : "bg-success/15 text-success",
        )}
      >
        {already ? <TriangleAlertIcon className="size-4" /> : <CheckCircle2Icon className="size-4" />}
        {already ? `Already in Batch ${outcome.batchNumber}` : `Added to Batch ${outcome.batchNumber}`}
      </span>

      <p className="mt-4 text-3xl leading-tight font-bold tracking-tight text-balance">
        {student.first_name} {student.last_name}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {student.phone ?? student.email} · in at {formatTime(outcome.timeIn, outcome.timezone)}
      </p>

      <ul className="mt-4 grid gap-2 text-sm">
        {outcome.firstTimer ? (
          <li className="flex gap-2">
            <UserCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            Registered as a first timer. An invitation was emailed to {student.email}.
          </li>
        ) : null}
        {outcome.assignedNow ? (
          <li className="flex gap-2">
            <UserCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            You&apos;re now {student.first_name}&apos;s facilitator.
          </li>
        ) : null}
        {outcome.genderMismatch ? (
          <li className="flex gap-2 text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            Their facilitator is a different gender, so chat is off. Ask your Campus Head to reassign.
          </li>
        ) : null}
      </ul>

      <Button size="lg" className="mt-6 w-full" onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
