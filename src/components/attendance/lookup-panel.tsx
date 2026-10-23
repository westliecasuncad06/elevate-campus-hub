"use client";

import { useState, useTransition } from "react";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addToBatchByIdAction,
  lookupStudentsAction,
  type AttendanceOutcome,
  type StudentHit,
} from "@/app/actions/attendance";
import { formatStudentNumberInput } from "@/lib/student-number";
import type { EntryMethod } from "@/lib/types";

const STATUS_TEXT = { not_in: "Not in yet", checked_in: "Checked in today", in_this_batch: "Already in this batch" } as const;

/** Find the student by student number (the usual way), phone number, email or name, and add them from the list. */
export function LookupPanel({
  batchId,
  onOutcome,
}: {
  batchId: string;
  onOutcome: (outcome: AttendanceOutcome) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StudentHit[] | null>(null);
  const [method, setMethod] = useState<EntryMethod>("manual");
  const [searching, startSearch] = useTransition();
  const [addingId, setAddingId] = useState<string | null>(null);

  function search(event: React.FormEvent) {
    event.preventDefault();
    startSearch(async () => {
      const result = await lookupStudentsAction(batchId, query);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHits(result.data!.hits);
      setMethod(result.data!.method);
    });
  }

  async function add(hit: StudentHit) {
    setAddingId(hit.id);
    const result = await addToBatchByIdAction(batchId, hit.id, method);
    setAddingId(null);
    if (result.ok && result.data) onOutcome(result.data);
    else if (!result.ok) toast.error(result.error);
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <form onSubmit={search} className="grid gap-2">
        <Label htmlFor="lookup-query">Student number, phone number or email</Label>
        <div className="flex gap-2">
          <Input
            id="lookup-query"
            value={query}
            // Something that starts like a student number (2017-…) gets its dashes as it is typed.
            onChange={(e) => {
              const v = e.target.value;
              setQuery(/^(19|20)[\d-]*$/.test(v.replace(/\s/g, "")) ? formatStudentNumberInput(v) : v);
            }}
            placeholder="2017-05-07107"
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" disabled={searching || query.trim().length < 3}>
            <SearchIcon />
            {searching ? "Searching…" : "Find"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Or type their phone number, email, or part of their name.</p>
      </form>

      {hits ? (
        hits.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No student found. If this is their first visit, use <span className="font-medium text-foreground">First timer</span>.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {hits.map((hit) => (
              <li key={hit.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{hit.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {hit.program ? `${hit.program} · ` : ""}
                    {hit.studentNumber ?? hit.phone ?? hit.email}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">{STATUS_TEXT[hit.status]}</p>
                </div>
                <Button
                  variant={hit.status === "in_this_batch" ? "outline" : "default"}
                  disabled={addingId !== null || hit.status === "in_this_batch"}
                  onClick={() => add(hit)}
                >
                  {addingId === hit.id ? "Adding…" : hit.status === "in_this_batch" ? "Added" : "Add to batch"}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
