import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { InviteStaffDialog } from "@/components/accounts/invite-staff-dialog";
import { ActiveToggleButton, ReassignFacilitator, ResendInviteButton, ResetTwoStepButton } from "@/components/accounts/row-actions";
import { AccountStatusBadge, isPending } from "@/components/accounts/status-badge";
import { LiveFilters, LiveSearch } from "@/components/live-filters";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { courseLabel } from "@/lib/course";
import { getActivePrograms } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { searchTerm } from "@/lib/postgrest";
import { fullName, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Students" };

type StudentRow = Profile & { program: { code: string } | null };

/** The Pending invitations button keeps whatever is typed in the search box. */
function pendingHref(pendingOnly: boolean, q: string): string {
  const params = new URLSearchParams();
  if (!pendingOnly) params.set("filter", "pending");
  if (q) params.set("q", q);
  const query = params.toString();
  return "/campus-head/students" + (query ? "?" + query : "");
}

export default async function StudentsPage({ searchParams }: PageProps<"/campus-head/students">) {
  const actor = await requireRole("campus_head");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const pendingOnly = params.filter === "pending";

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("*, program:programs(code)")
    .eq("role", "student")
    .order("created_at", { ascending: false })
    .limit(300);
  if (pendingOnly) query = query.is("invitation_accepted_at", null).eq("is_active", true);
  if (q) {
    const safe = searchTerm(q);
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const [{ data: studentRows }, { data: assignments }, { data: facilitatorRows }, { count: pendingCount }, programs] =
    await Promise.all([
      query,
      supabase.from("facilitator_students").select("student_id, facilitator_id").eq("is_active", true),
      // Only facilitators who have registered: until then they have no gender (so no chat) and can't sign in.
      supabase.from("profiles").select("id, first_name, last_name, gender").eq("role", "facilitator").eq("is_active", true).eq("details_complete", true).order("first_name"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student")
        .eq("is_active", true)
        .is("invitation_accepted_at", null),
      getActivePrograms(supabase, actor.campus_id),
    ]);

  const students = (studentRows ?? []) as StudentRow[];
  const facilitators = (facilitatorRows ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "gender">[];
  const facilitatorById = new Map(facilitators.map((f) => [f.id, f]));
  const assignedTo = new Map((assignments ?? []).map((a) => [a.student_id as string, a.facilitator_id as string]));
  const facilitatorOptions = facilitators.map((f) => ({ value: f.id, label: `${fullName(f)} (${f.gender ?? "—"})` }));

  return (
    <>
      <PageHeader
        title="Students"
        description="Everyone registered at your campus. Students are assigned to the facilitator who first takes their attendance."
        actions={
          <>
            <InviteStaffDialog role="student" />
            <AccountDialog role="student" programs={programs} label="Add student" />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {/* Filters as you type: no Search button. */}
        <LiveFilters params={["q"]} className="flex min-w-64 flex-1 items-end gap-2 !border-0 !bg-transparent !p-0">
          <LiveSearch placeholder="Name, email or phone" className="min-w-52 flex-1" />
        </LiveFilters>
        <Button variant={pendingOnly ? "default" : "outline"} nativeButton={false} render={<Link href={pendingHref(pendingOnly, q)} />}>
          Pending invitations ({pendingCount ?? 0})
        </Button>
      </div>

      {students.length === 0 ? (
        <EmptyState
          title={pendingOnly ? "No pending invitations" : q ? "No students match" : "No students yet"}
          hint={
            pendingOnly
              ? "Everyone you registered has set their password."
              : "Students appear here once they're registered by you or a facilitator."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Facilitator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const facilitatorId = assignedTo.get(s.id) ?? null;
                const facilitator = facilitatorId ? facilitatorById.get(facilitatorId) : null;
                const mismatch = facilitator && facilitator.gender !== s.gender;
                return (
                  <TableRow key={s.id} className={s.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{fullName(s)}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.phone ?? "No phone"} · {s.email}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {courseLabel(s) ?? "—"}
                      {s.year_level ? ` · Year ${s.year_level}` : ""}
                    </TableCell>
                    <TableCell>
                      <ReassignFacilitator studentId={s.id} currentId={facilitatorId} facilitators={facilitatorOptions} />
                      {mismatch ? (
                        <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                          <TriangleAlertIcon className="size-3.5" />
                          Different gender, so chat is off. Pick a {s.gender} facilitator.
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <AccountStatusBadge profile={s} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isPending(s) ? <ResendInviteButton profileId={s.id} /> : null}
                        {s.mfa_enabled ? <ResetTwoStepButton profileId={s.id} name={fullName(s)} /> : null}
                        <ActiveToggleButton profileId={s.id} active={s.is_active} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
