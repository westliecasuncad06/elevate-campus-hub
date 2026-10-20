"use client";

import { useState, useTransition } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveEngagementAction, type EngagementAnswers } from "@/app/actions/engagement";
import type { BatchStudent } from "@/lib/types";

const QUESTIONS = [
  { key: "isEngaged", text: "Did you engage with this student today?" },
  { key: "heardGospel", text: "Did they hear the Gospel?" },
  { key: "acceptedJesus", text: "Did they accept Jesus Christ?" },
  { key: "wantsDgroup", text: "Do they want to join a Discipleship Group (D-Group)?" },
] as const satisfies readonly { key: keyof EngagementAnswers; text: string }[];

const EMPTY: EngagementAnswers = { isEngaged: false, heardGospel: false, acceptedJesus: false, wantsDgroup: false };

type Person = Pick<BatchStudent, "logId" | "firstName">;

/** The 4-step Yes/No flow. Answering "No" to question 1 saves immediately and skips the rest. */
export function EngagementDialog({
  student,
  onClose,
}: {
  student: Person | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Remount per student so the flow always starts at question 1. */}
        {student ? <Flow key={student.logId} student={student} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Flow({ student, onDone }: { student: Person; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<EngagementAnswers>(EMPTY);
  const [pending, startTransition] = useTransition();
  const question = QUESTIONS[step];

  function save(final: EngagementAnswers) {
    startTransition(async () => {
      const result = await saveEngagementAction(student.logId, final);
      if (result.ok) {
        toast.success(`${student.firstName}'s engagement saved.`);
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  function answer(value: boolean) {
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    if (step === 0 && !value) return save(EMPTY);
    if (step === QUESTIONS.length - 1) return save(next);
    setStep(step + 1);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{student.firstName}</DialogTitle>
        <DialogDescription>
          Question {step + 1} of {QUESTIONS.length}
        </DialogDescription>
      </DialogHeader>

      <div className="flex gap-1" aria-hidden="true">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={i <= step ? "h-1.5 flex-1 rounded-full bg-primary" : "h-1.5 flex-1 rounded-full bg-muted"} />
        ))}
      </div>

      <p className="py-4 text-xl leading-snug font-semibold text-balance">{question.text}</p>

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" className="h-14 text-lg" disabled={pending} onClick={() => answer(true)}>
          Yes
        </Button>
        <Button size="lg" variant="outline" className="h-14 text-lg" disabled={pending} onClick={() => answer(false)}>
          No
        </Button>
      </div>

      {step > 0 ? (
        <Button variant="ghost" className="justify-self-start" disabled={pending} onClick={() => setStep(step - 1)}>
          <ArrowLeftIcon />
          Back
        </Button>
      ) : null}
    </>
  );
}
