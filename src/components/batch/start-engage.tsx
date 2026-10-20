"use client";

import { HandshakeIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStartBatch } from "./use-start-batch";

/** Shown on Today when no batch is open: one clear button to begin. */
export function StartEngage({ basePath, finishedToday }: { basePath: string; finishedToday: number }) {
  const { start, pending } = useStartBatch(basePath);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HandshakeIcon className="size-7" />
      </span>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">Ready to engage?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Start a batch, then add the students you&apos;re talking with. You&apos;ll record how each conversation went
        before you finish the batch.
      </p>
      <Button size="lg" className="mt-6 w-full sm:w-auto sm:min-w-48" onClick={start} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        {pending ? "Starting…" : "Start engage"}
      </Button>
      {finishedToday > 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          You&apos;ve finished {finishedToday} {finishedToday === 1 ? "batch" : "batches"} today. They&apos;re saved in History.
        </p>
      ) : null}
    </div>
  );
}
