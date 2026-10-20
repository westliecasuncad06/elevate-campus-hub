"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { AttendanceStation } from "@/components/attendance/attendance-station";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { finishBatchAction } from "@/app/actions/batches";
import { formatTime } from "@/lib/dates";
import type { Batch, Program } from "@/lib/types";
import { StudentTiles } from "./student-tiles";

/** One open batch: add students, record each one's engagement, then finish it. */
export function BatchWorkspace({
  batch,
  programs,
  timezone,
  basePath,
}: {
  batch: Batch;
  programs: Program[];
  timezone: string;
  basePath: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [finishing, startFinish] = useTransition();

  const pending = batch.students.filter((s) => !s.engagement).length;
  const empty = batch.students.length === 0;

  function finish() {
    startFinish(async () => {
      const result = await finishBatchAction(batch.id);
      if (!result.ok) {
        // Not finished: point at the students who still need their engagement recorded.
        setHighlight(true);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Batch finished.");
      router.push(basePath);
    });
  }

  return (
    <section aria-labelledby="batch-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="batch-heading" className="text-xl font-bold tracking-tight">
            Batch {batch.number}
          </h2>
          <p className="text-sm text-muted-foreground">
            Started {formatTime(batch.startedAt, timezone)}
            {" · "}
            {empty
              ? "no students yet"
              : `${batch.students.length} ${batch.students.length === 1 ? "student" : "students"}${
                  pending > 0 ? ` · ${pending} still to record` : " · all recorded"
                }`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding(true)}>
            <UserPlusIcon />
            Add students
          </Button>
          <Button variant="outline" onClick={finish} disabled={finishing}>
            <CheckCheckIcon />
            {finishing ? "Finishing…" : empty ? "Discard batch" : "Finish batch"}
          </Button>
        </div>
      </div>

      {/* Attendance lives in a modal. It unmounts when closed, which also switches the camera off. */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add students to Batch {batch.number}</DialogTitle>
            <DialogDescription>
              Scan a QR card, look someone up by phone or email, or register a first timer. Close this window when you&apos;re done adding.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <AttendanceStation batchId={batch.id} programs={programs} />
          </div>
        </DialogContent>
      </Dialog>

      {highlight && pending > 0 ? (
        <p role="alert" className="mb-4 rounded-xl bg-brand/20 px-4 py-3 text-sm font-medium text-brand-ink">
          Record engagement for the highlighted {pending === 1 ? "student" : "students"} first, then finish the batch.
        </p>
      ) : null}

      {empty ? (
        <div className="rounded-2xl border border-dashed px-4 py-12 text-center">
          <p className="font-medium">No one is in this batch yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add the students you&apos;re talking with. Each one is marked present when you add them.
          </p>
          <Button className="mt-4" onClick={() => setAdding(true)}>
            <UserPlusIcon />
            Add students
          </Button>
        </div>
      ) : (
        <StudentTiles students={batch.students} timezone={timezone} highlightPending={highlight && pending > 0} />
      )}
    </section>
  );
}
