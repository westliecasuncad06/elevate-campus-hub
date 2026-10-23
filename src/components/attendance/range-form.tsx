"use client";

import { useRouter } from "next/navigation";
import { Field, SubmitButton } from "@/components/forms";

/**
 * The From / To dates of the attendance sheet. Pressing Show moves to the new range without reloading the whole page
 * (a plain GET form would), so only the sheet below shows its loading animation.
 */
export function RangeForm({ from, to, today }: { from: string; to: string; today: string }) {
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams({ from: String(data.get("from") ?? from), to: String(data.get("to") ?? to) });
        router.push(`/campus-head/attendance?${params}`);
      }}
    >
      <Field label="From" name="from" type="date" defaultValue={from} max={to} required />
      <Field label="To" name="to" type="date" defaultValue={to} max={today} required />
      <SubmitButton variant="secondary">Show</SubmitButton>
    </form>
  );
}
