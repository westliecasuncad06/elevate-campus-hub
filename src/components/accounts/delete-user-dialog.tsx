"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteUserAction } from "@/app/actions/users";
import type { Role } from "@/lib/types";

/** Super Admin: permanently delete a person, after an explicit confirmation. */
export function DeleteUserButton({ profileId, name, role }: { profileId: string; name: string; role: Role }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset(next: boolean) {
    setOpen(next);
    if (next) {
      setConfirmed(false);
      setError(null);
    }
  }

  function remove() {
    start(async () => {
      const result = await deleteUserAction(profileId);
      if (result.ok) {
        toast.success(result.message ?? "Deleted.");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => reset(true)}>
        <Trash2Icon />
        Delete
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              {role === "student"
                ? "This permanently deletes their account and everything recorded about them: attendance, engagement answers, chat messages and notifications."
                : "This permanently deletes their account, their availability and their chat messages."}{" "}
              It can&apos;t be undone. If you only want to stop them signing in, <strong>Deactivate</strong> them instead.
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            />
            <span>I understand this can&apos;t be undone.</span>
          </label>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep them
            </Button>
            <Button variant="destructive" onClick={remove} disabled={!confirmed || pending}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
