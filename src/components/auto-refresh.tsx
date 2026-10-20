"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RadioIcon } from "lucide-react";

/** Re-fetches the page's server data every few seconds (only while the tab is visible). */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setUpdated(new Date());
      }
    };
    const id = setInterval(tick, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="off">
      <RadioIcon className="size-3.5 text-success" />
      Live · updates every {seconds} seconds
      {updated ? ` · last ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}
    </p>
  );
}
