import type { Metadata } from "next";
import { PencilIcon, PlusIcon } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { Field, FormSelect } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ProgramRowActions } from "@/components/admin/program-row-actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createProgramAction, updateProgramAction } from "@/app/actions/programs";
import { createClient } from "@/lib/supabase/server";
import type { Campus, Program } from "@/lib/types";

export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const supabase = await createClient();
  const [{ data: programRows }, { data: campusRows }] = await Promise.all([
    supabase.from("programs").select("*").order("sort_order").order("code"),
    supabase.from("campuses").select("id, code, name").order("code"),
  ]);
  const programs = (programRows ?? []) as Program[];
  const campuses = (campusRows ?? []) as Pick<Campus, "id" | "code" | "name">[];

  const campusOptions = campuses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  // One list per campus, so the up/down arrows only move a program within its own campus.
  const byCampus = new Map<string, Program[]>();
  for (const p of programs) {
    const key = p.campus_id ?? "none";
    byCampus.set(key, [...(byCampus.get(key) ?? []), p]);
  }
  const sections = [
    ...campuses.map((c) => ({ key: c.id, title: `${c.code} — ${c.name}`, list: byCampus.get(c.id) ?? [], hasCampus: true })),
    // Left over from before programs belonged to a campus; nobody is offered these any more.
    ...(byCampus.has("none")
      ? [{ key: "none", title: "Not assigned to a campus", list: byCampus.get("none")!, hasCampus: false }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Programs"
        description="Each campus has its own list of courses that students pick when they register. A campus with no programs lets students type their course instead."
        actions={
          <FormDialog
            action={createProgramAction}
            title="Add program"
            submitLabel="Add program"
            pendingLabel="Adding…"
            triggerLabel="Add program"
            triggerIcon={<PlusIcon />}
          >
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <Field label="Code" name="code" placeholder="BSCpE" required maxLength={16} />
                <Field label="Name" name="name" placeholder="BS Computer Engineering" required />
              </div>
              <FormSelect label="Campus" name="campus_id" options={campusOptions} placeholder="Select a campus" required />
            </div>
          </FormDialog>
        }
      />

      {campuses.length === 0 ? (
        <EmptyState title="No campuses yet" hint="Add a campus first, then add its programs." />
      ) : (
        <div className="grid gap-6">
          {sections.map(({ key, title, list, hasCampus }) => (
            <section key={key}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h2>
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-card/50 px-4 py-5 text-sm text-muted-foreground">
                  {hasCampus
                    ? "No programs. Students here type their course when they register. Add a program to give them a dropdown instead."
                    : "No programs."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((p, i) => (
                        <TableRow key={p.id} className={p.is_active ? undefined : "opacity-60"}>
                          <TableCell className="font-semibold">{p.code}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {p.name}
                              <FormDialog
                                action={updateProgramAction.bind(null, p.id)}
                                title={`Rename ${p.code}`}
                                submitLabel="Save changes"
                                pendingLabel="Saving…"
                                triggerLabel=""
                                triggerIcon={<PencilIcon />}
                                triggerVariant="ghost"
                                triggerSize="icon-sm"
                              >
                                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                                  <Field label="Code" name="code" defaultValue={p.code} required maxLength={16} />
                                  <Field label="Name" name="name" defaultValue={p.name} required />
                                </div>
                              </FormDialog>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.is_active ? "secondary" : "outline"}>
                              {p.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <ProgramRowActions
                              programId={p.id}
                              active={p.is_active}
                              isFirst={i === 0}
                              isLast={i === list.length - 1}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
