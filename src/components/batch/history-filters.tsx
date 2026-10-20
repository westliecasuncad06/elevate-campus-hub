import { Field, FormSelect, SubmitButton, type Option } from "@/components/forms";

/** Date range (and, for the Campus Head, facilitator) filter. A plain GET form, so the URL is shareable. */
export function HistoryFilters({
  from,
  to,
  max,
  facilitators,
  facilitator,
}: {
  from: string;
  to: string;
  max: string;
  facilitators?: Option[];
  facilitator?: string;
}) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <Field label="From" name="from" type="date" defaultValue={from} max={max} required />
      <Field label="To" name="to" type="date" defaultValue={to} max={max} required />
      {facilitators ? (
        <FormSelect
          label="Facilitator"
          name="facilitator"
          defaultValue={facilitator ?? "all"}
          options={[{ value: "all", label: "Everyone" }, ...facilitators]}
          className="min-w-52"
        />
      ) : null}
      <SubmitButton variant="secondary">Show</SubmitButton>
    </form>
  );
}
