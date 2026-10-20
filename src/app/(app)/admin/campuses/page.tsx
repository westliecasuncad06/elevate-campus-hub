import type { Metadata } from "next";
import { PencilIcon, PlusIcon } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { Field, FormSelect } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveCampusAction } from "@/app/actions/campuses";
import { createClient } from "@/lib/supabase/server";
import type { Campus } from "@/lib/types";

export const metadata: Metadata = { title: "Campuses" };

const STATUS = [
  { value: "on", label: "Active" },
  { value: "off", label: "Inactive" },
];

function CampusFields({ campus }: { campus?: Campus }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Code" name="code" defaultValue={campus?.code} placeholder="GRC" required maxLength={12} />
        <Field label="Campus name" name="name" defaultValue={campus?.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Timezone"
          name="timezone"
          defaultValue={campus?.timezone ?? "Asia/Manila"}
          hint="Attendance days start and end by this clock."
          required
        />
        <FormSelect label="Status" name="is_active" options={STATUS} defaultValue={campus?.is_active === false ? "off" : "on"} />
      </div>
      <Field
        label="Default Google Doc for reports (optional)"
        name="target_google_doc"
        defaultValue={campus?.target_google_doc_id ? `https://docs.google.com/document/d/${campus.target_google_doc_id}/edit` : ""}
        placeholder="https://docs.google.com/document/d/…"
      />
      <Field
        label="Google Form webhook URL (optional)"
        name="google_form_webhook_url"
        defaultValue={campus?.google_form_webhook_url ?? ""}
        placeholder="https://script.google.com/macros/s/…/exec"
      />
    </div>
  );
}

export default async function CampusesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("campuses").select("*").order("code");
  const campuses = (data ?? []) as Campus[];

  return (
    <>
      <PageHeader
        title="Campuses"
        description="Each campus has its own people, attendance and reports."
        actions={
          <FormDialog
            action={saveCampusAction.bind(null, null)}
            title="Add campus"
            submitLabel="Create campus"
            pendingLabel="Creating…"
            triggerLabel="Add campus"
            triggerIcon={<PlusIcon />}
            wide
          >
            <CampusFields />
          </FormDialog>
        }
      />

      {campuses.length === 0 ? (
        <EmptyState title="No campuses yet" hint="Add your first campus to start registering people." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campuses.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.timezone}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "secondary" : "outline"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <FormDialog
                      action={saveCampusAction.bind(null, c.id)}
                      title={`Edit ${c.code}`}
                      submitLabel="Save changes"
                      pendingLabel="Saving…"
                      triggerLabel="Edit"
                      triggerIcon={<PencilIcon />}
                      triggerVariant="outline"
                      triggerSize="sm"
                      wide
                    >
                      <CampusFields campus={c} />
                    </FormDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
