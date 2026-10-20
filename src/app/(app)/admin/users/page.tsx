import type { Metadata } from "next";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ActiveToggleButton, ResendInviteButton, ResetPasswordButton } from "@/components/accounts/row-actions";
import { AccountStatusBadge, isPending } from "@/components/accounts/status-badge";
import { FormSelect, SubmitButton } from "@/components/forms";
import { Field } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { getActivePrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { fullName, type Campus, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 100;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await requireRole("super_admin");
  const params = await searchParams;
  const role = typeof params.role === "string" ? params.role : "all";
  const campus = typeof params.campus === "string" ? params.campus : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  const { data: campusRows } = await supabase.from("campuses").select("id, code, name").order("code");
  const campuses = (campusRows ?? []) as Pick<Campus, "id" | "code" | "name">[];
  const campusCode = new Map(campuses.map((c) => [c.id, c.code]));

  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(PAGE_SIZE);
  if (role !== "all") query = query.eq("role", role);
  if (campus !== "all") query = query.eq("campus_id", campus);
  if (q) {
    // Strip characters that have meaning inside a PostgREST filter expression.
    const safe = q.replace(/[,()%*]/g, " ");
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data } = await query;
  const people = (data ?? []) as Profile[];

  const programs = await getActivePrograms(supabase, null);
  const campusOptions = campuses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a login, across all campuses."
        actions={
          <>
            <AccountDialog role="campus_head" campuses={campusOptions} />
            <AccountDialog role="facilitator" campuses={campusOptions} />
            <AccountDialog role="student" programs={programs} campuses={campusOptions} />
          </>
        }
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
        <Field label="Search" name="q" defaultValue={q} placeholder="Name, email or phone" />
        <FormSelect
          label="Role"
          name="role"
          defaultValue={role}
          options={[
            { value: "all", label: "All roles" },
            ...(["super_admin", "campus_head", "facilitator", "student"] as const).map((r) => ({
              value: r,
              label: ROLE_LABEL[r],
            })),
          ]}
        />
        <FormSelect
          label="Campus"
          name="campus"
          defaultValue={campus}
          options={[{ value: "all", label: "All campuses" }, ...campuses.map((c) => ({ value: c.id, label: c.code }))]}
        />
        <SubmitButton variant="secondary">Filter</SubmitButton>
      </form>

      {people.length === 0 ? (
        <EmptyState title="No one matches" hint="Try a different search, or clear the filters." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{fullName(p)}</p>
                      <p className="text-xs text-muted-foreground">{p.email}</p>
                    </TableCell>
                    <TableCell>{ROLE_LABEL[p.role]}</TableCell>
                    <TableCell>{p.campus_id ? (campusCode.get(p.campus_id) ?? "—") : "All"}</TableCell>
                    <TableCell>
                      <AccountStatusBadge profile={p} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isPending(p) ? <ResendInviteButton profileId={p.id} /> : null}
                        <ResetPasswordButton profileId={p.id} name={fullName(p)} />
                        {p.id !== actor.id ? <ActiveToggleButton profileId={p.id} active={p.is_active} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {people.length === PAGE_SIZE ? (
            <p className="mt-2 text-xs text-muted-foreground">Showing the newest {PAGE_SIZE}. Use search to narrow it down.</p>
          ) : null}
        </>
      )}
    </>
  );
}
