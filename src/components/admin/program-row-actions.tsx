"use client";

import { useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveProgramAction, setProgramActiveAction } from "@/app/actions/programs";
import type { ActionResult } from "@/lib/types";

export function ProgramRowActions({
  programId,
  active,
  isFirst,
  isLast,
}: {
  programId: string;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (result.message) toast.success(result.message);
    });

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Move up"
        disabled={pending || isFirst}
        onClick={() => run(() => moveProgramAction(programId, "up"))}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Move down"
        disabled={pending || isLast}
        onClick={() => run(() => moveProgramAction(programId, "down"))}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        variant={active ? "ghost" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() => run(() => setProgramActiveAction(programId, !active))}
      >
        {active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
