"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { switchMyCampusAction } from "@/app/actions/my-campus";
import { cn } from "@/lib/utils";

export interface SwitchableCampus {
  id: string;
  code: string;
  name: string;
  is_current: boolean;
}

/** For a facilitator who works at several campuses: which one are they at right now? */
export function CampusSwitcher({ options, className }: { options: SwitchableCampus[]; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.is_current) ?? options[0];

  function switchTo(id: string) {
    if (id === current.id) return;
    startTransition(async () => {
      const result = await switchMyCampusAction(id);
      if (result.ok) {
        toast.success(result.message ?? "Campus switched.");
        // Today lives at the same address for every campus, so go there (and reload what it shows).
        router.push("/facilitator");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Select
      value={current.id}
      items={options.map((o) => ({ value: o.id, label: `${o.code} · ${o.name}` }))}
      onValueChange={(value) => value && switchTo(value as string)}
    >
      <SelectTrigger
        aria-label="Campus you are working at"
        disabled={pending}
        className={cn(
          "h-8 max-w-[8.5rem] border-white/25 bg-white/10 text-xs text-white sm:max-w-[13rem] lg:max-w-xs lg:border-input lg:bg-background lg:text-sm lg:text-foreground",
          pending && "opacity-60",
          className,
        )}
      >
        {/* min-w-0 + truncate: a long campus name shortens instead of widening the header on a phone. */}
        <SelectValue className="min-w-0 flex-1 truncate" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.code} · {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
