"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { startBatchAction } from "@/app/actions/batches";

/** Starts the next batch and jumps to it (`basePath?batch=<id>`). */
export function useStartBatch(basePath: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result = await startBatchAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Batch started.");
      router.push(`${basePath}?batch=${result.data!.id}`);
    });
  }

  return { start, pending };
}
