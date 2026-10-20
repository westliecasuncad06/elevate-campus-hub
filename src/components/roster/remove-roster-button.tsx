"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeRosterNameAction } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Campus Head: remove a name that hasn't registered (asks first). */
export function RemoveRosterButton({ rosterId, name }: { rosterId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeRosterNameAction(rosterId);
      if (result.ok) {
        toast.success(result.message ?? "Removed.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2Icon />
        Remove
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {name} from the roster?</DialogTitle>
            <DialogDescription>
              Use this for a name that is listed twice or someone who left. They haven&apos;t registered yet, so nothing else
              is lost. It can&apos;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "Removing…" : "Remove name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
