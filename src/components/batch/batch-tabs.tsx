"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AddBatchButton, type PendingBatch } from "./add-batch-button";

export interface TabBatch extends PendingBatch {
  id: string;
}

/** Batch switcher for phones (on desktop the same batches are listed under Today in the sidebar). */
export function BatchTabs({
  basePath,
  batches,
  selectedId,
}: {
  basePath: string;
  batches: TabBatch[];
  selectedId: string;
}) {
  return (
    <nav aria-label="Batches" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
      {batches.map((b) => (
        <Link
          key={b.id}
          href={`${basePath}?batch=${b.id}`}
          aria-current={b.id === selectedId ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium",
            b.id === selectedId ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground",
          )}
        >
          Batch {b.number}
          {b.pending > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
              {b.pending}
            </span>
          ) : null}
        </Link>
      ))}
      <AddBatchButton basePath={basePath} label="Add another batch" pendingBatches={batches} variant="chip" />
    </nav>
  );
}
