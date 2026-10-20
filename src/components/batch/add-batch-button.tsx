"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStartBatch } from "./use-start-batch";

export interface PendingBatch {
  number: number;
  pending: number;
}

/**
 * "Add another batch" / "Start engage". If an open batch still has students without engagement recorded,
 * a reminder appears first. It's only a reminder: "Add anyway" skips it.
 */
export function AddBatchButton({
  basePath,
  label,
  pendingBatches,
  variant,
  className,
}: {
  basePath: string;
  label: string;
  pendingBatches: PendingBatch[];
  variant: "sidebar" | "chip";
  className?: string;
}) {
  const { start, pending } = useStartBatch(basePath);
  const [reminder, setReminder] = useState(false);
  const outstanding = pendingBatches.filter((b) => b.pending > 0);

  function click() {
    if (outstanding.length > 0) setReminder(true);
    else start();
  }

  return (
    <>
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className={cn(
          variant === "sidebar"
            ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3.5 py-1.5 text-sm font-medium text-primary",
          className,
        )}
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
        {label}
      </button>

      <Dialog open={reminder} onOpenChange={setReminder}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finish recording first?</DialogTitle>
            <DialogDescription>
              {outstanding.map((b) => `Batch ${b.number} still has ${b.pending} ${b.pending === 1 ? "student" : "students"} without engagement recorded`).join(". ")}
              . It helps to fill them in so nothing is missed. You can still add another batch now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminder(false)}>
              Go back and record
            </Button>
            <Button
              onClick={() => {
                setReminder(false);
                start();
              }}
            >
              Add another batch anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
