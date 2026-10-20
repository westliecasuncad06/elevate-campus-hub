import type { Metadata } from "next";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { DeleteUserButton } from "@/components/accounts/delete-user-dialog";
import { EditUserDialog } from "@/components/accounts/edit-user-dialog";
import { InviteStaffDialog } from "@/components/accounts/invite-staff-dialog";
import { ActiveToggleButton, ResendInviteButton, ResetPasswordButton, ResetTwoStepButton } from "@/components/accounts/row-actions";
import { AccountStatusBadge, isPending } from "@/components/accounts/status-badge";
import { FormSelect, SubmitButton } from "@/components/forms";
import { Field } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { courseLabel } from "@/lib/course";
import { ROLE_LABEL } from "@/lib/roles";
import { getActiveProgramsByCampus } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { searchTerm } from "@/lib/postgrest";
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

  let query = supabase.from("profiles").select("*, program:programs(code)").order("created_at", { ascending: false }).limit(PAGE_SIZE);
  if (role !== "all") query = query.eq("role", role);
  if (campus !== "all") query = query.eq("campus_id", campus);
  if (q) {
    // Cleaned first: commas, brackets and quotes have meaning inside a filter expression.
    const safe = searchTerm(q);
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data } = await query;
  const people = (data ?? []) as unknown as (Profile & { program: { code: string } | null })[];

  const programsByCampus = await getActiveProgramsByCampus(supabase);

  // The other campuses each facilitator works at (besides the one they are set to now).
  const { data: extraRows } = await supabase.from("profile_campuses").select("profile_id, campus_id");
  const extraCampuses = new Map<string, string[]>();
  for (const row of (extraRows ?? []) as { profile_id: string; campus_id: string }[]) {
    extraCampuses.set(row.profile_id, [...(extraCampuses.get(row.profile_id) ?? []), row.campus_id]);
  }
  const campusOptions = campuses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a login, across all campuses."
        actions={
          <>
            <InviteStaffDialog role="campus_head" campuses={campusOptions} />
            <InviteStaffDialog role="facilitator" campuses={campusOptions} />
            <InviteStaffDialog role="student" campuses={campusOptions} />
            <AccountDialog role="student" programsByCampus={programsByCampus} campuses={campusOptions} />
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
                      {p.role === "student" ? (
                        <p className="text-xs text-muted-foreground">
                          {[courseLabel(p), p.year_level ? `Year ${p.year_level}` : null].filter(Boolean).join(" · ") || "No course yet"}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[p.role]}</TableCell>
                    <TableCell>
                      {p.campus_id ? (
                        <>
                          {campusCode.get(p.campus_id) ?? "—"}
                          {(extraCampuses.get(p.id) ?? []).length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              also {(extraCampuses.get(p.id) ?? []).map((id) => campusCode.get(id) ?? "?").sort().join(", ")}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        "All"
                      )}
                    </TableCell>
                    <TableCell>
                      <AccountStatusBadge profile={p} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <EditUserDialog
                          person={{
                            id: p.id,
                            role: p.role,
                            campus_id: p.campus_id,
                            first_name: p.first_name,
                            last_name: p.last_name,
                            email: p.email,
                            phone: p.phone,
                            gender: p.gender,
                            birthday: p.birthday,
                            church: p.church,
                            religion: p.religion,
                            program_id: p.program_id,
                            course: p.course,
                            year_level: p.year_level,
                            student_number: p.student_number,
                            extra_campus_ids: extraCampuses.get(p.id) ?? [],
                          }}
                          campuses={campusOptions}
                          programsByCampus={programsByCampus}
                        />
                        {isPending(p) ? <ResendInviteButton profileId={p.id} /> : null}
                        <ResetPasswordButton profileId={p.id} name={fullName(p)} />
                        {p.mfa_enabled && p.id !== actor.id ? <ResetTwoStepButton profileId={p.id} name={fullName(p)} /> : null}
                        {p.id !== actor.id ? <ActiveToggleButton profileId={p.id} active={p.is_active} /> : null}
                        {p.id !== actor.id && p.role !== "super_admin" ? (
                          <DeleteUserButton profileId={p.id} name={fullName(p)} role={p.role} />
                        ) : null}
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
