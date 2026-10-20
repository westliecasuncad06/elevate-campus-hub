"use client";

import { useEffect, useState } from "react";
import { useFormAction } from "@/components/use-form-action";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Input } from "@/components/ui/input";
import { saveAvailabilityAction } from "@/app/actions/availability";
import { DAY_NAMES } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface Slot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

/** Weekly schedule: tick the days you're free and set the hours. */
export function AvailabilityEditor({ slots }: { slots: Slot[] }) {
  const byDay = new Map(slots.map((s) => [s.day_of_week, s]));
  const [enabled, setEnabled] = useState<boolean[]>(() => DAY_NAMES.map((_, d) => byDay.has(d)));
  const { state, pending, formProps } = useFormAction(saveAvailabilityAction);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved.");
  }, [state]);

  return (
    <form {...formProps} className="grid gap-4">
      <ul className="grid gap-2">
        {DAY_NAMES.map((name, day) => {
          const slot = byDay.get(day);
          return (
            <li
              key={name}
              className={cn(
                "grid items-center gap-3 rounded-2xl border bg-card p-3 sm:grid-cols-[10rem_1fr]",
                enabled[day] && "border-primary/30",
              )}
            >
              <label className="flex cursor-pointer items-center gap-3 font-medium">
                <input
                  type="checkbox"
                  name={`available_${day}`}
                  checked={enabled[day]}
                  onChange={(e) => setEnabled(enabled.map((v, i) => (i === day ? e.target.checked : v)))}
                  className="size-5 accent-[var(--primary)]"
                />
                {name}
              </label>
              {enabled[day] ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    name={`start_${day}`}
                    defaultValue={slot?.start_time.slice(0, 5) ?? DEFAULT_START}
                    aria-label={`${name} start time`}
                    required
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    name={`end_${day}`}
                    defaultValue={slot?.end_time.slice(0, 5) ?? DEFAULT_END}
                    aria-label={`${name} end time`}
                    required
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not available</p>
              )}
            </li>
          );
        })}
      </ul>
      <FormMessage state={state?.ok ? null : state} />
      <div>
        <SubmitButton size="lg" pending={pending} pendingText="Saving…">
          Save availability
        </SubmitButton>
      </div>
    </form>
  );
}
