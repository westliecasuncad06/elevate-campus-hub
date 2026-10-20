"use client";

import { updateMyYearLevelAction } from "@/app/actions/my-profile";
import { FormMessage, FormSelect, SubmitButton, type Option } from "@/components/forms";
import { useFormAction } from "@/components/use-form-action";

const YEAR_OPTIONS: Option[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Year ${n}` }));

/** A student's own year level: the one detail they can change themselves. */
export function YearLevelCard({ yearLevel }: { yearLevel: number | null }) {
  const { state, pending, formProps } = useFormAction(updateMyYearLevelAction);

  return (
    <section aria-labelledby="year-level-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="year-level-heading" className="text-lg font-semibold">
        Your year level
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Moved up a year? Update it here. For any other change to your details, ask your facilitator or Campus Head.
      </p>
      <form {...formProps} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <FormSelect
          // Start the dropdown over when the saved year changes (a select's default can't change while it is on screen).
          key={yearLevel ?? "none"}
          label="Year level"
          name="year_level"
          options={YEAR_OPTIONS}
          defaultValue={yearLevel ? String(yearLevel) : undefined}
          placeholder="Select your year level"
          required
        />
        <SubmitButton pending={pending} pendingText="Saving…">
          Save
        </SubmitButton>
        <div className="sm:col-span-2">
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}
