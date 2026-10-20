import type { Metadata } from "next";
import { InviteStaffDialog } from "@/components/accounts/invite-staff-dialog";
import { ActiveToggleButton, ResendInviteButton } from "@/components/accounts/row-actions";
import { AccountStatusBadge, isPending } from "@/components/accounts/status-badge";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { DAY_NAMES } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { fullName, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Facilitators" };

interface AvailabilityRow {
  facilitator_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

function shortTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

export default async function FacilitatorsPage() {
  const actor = await requireRole("campus_head");
  const supabase = await createClient();

  const [{ data: facilitatorRows }, { data: assignments }, { data: availabilityRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "facilitator").order("first_name"),
    supabase.from("facilitator_students").select("facilitator_id").eq("is_active", true),
    supabase
      .from("facilitator_availability")
      .select("facilitator_id, day_of_week, start_time, end_time, is_available")
      .eq("is_available", true)
      .order("day_of_week")
      .order("start_time"),
  ]);

  const facilitators = (facilitatorRows ?? []) as Profile[];
  const studentCount = new Map<string, number>();
  for (const a of assignments ?? []) {
    studentCount.set(a.facilitator_id, (studentCount.get(a.facilitator_id) ?? 0) + 1);
  }
  const availability = new Map<string, AvailabilityRow[]>();
  for (const row of (availabilityRows ?? []) as AvailabilityRow[]) {
    availability.set(row.facilitator_id, [...(availability.get(row.facilitator_id) ?? []), row]);
  }

  return (
    <>
      <PageHeader
        title="Facilitators"
        description="Your volunteer team, with their weekly availability."
        actions={<InviteStaffDialog role="facilitator" />}
      />

      {facilitators.length === 0 ? (
        <EmptyState
          title="No facilitators yet"
          hint="Add a facilitator with just their email. They register with the code in the invitation and fill in their own details."
          action={<InviteStaffDialog role="facilitator" />}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facilitator</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facilitators.map((f) => {
                const slots = availability.get(f.id) ?? [];
                // Facilitators work at several schools. One set to another school right now is still on this team.
                const elsewhere = f.campus_id !== actor.campus_id;
                return (
                  <TableRow key={f.id} className={f.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{fullName(f)}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.gender === "male" ? "Male" : f.gender === "female" ? "Female" : "Not registered yet"} · {f.phone ?? f.email}
                      </p>
                      {elsewhere ? (
                        <p className="mt-0.5 text-xs font-medium text-brand-ink">Also works at another campus</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{studentCount.get(f.id) ?? 0}</TableCell>
                    <TableCell className="max-w-xs text-sm">
                      {slots.length === 0 ? (
                        <span className="text-muted-foreground">Not set</span>
                      ) : (
                        <ul className="grid gap-0.5">
                          {slots.map((s, i) => (
                            <li key={i}>
                              <span className="font-medium">{DAY_NAMES[s.day_of_week].slice(0, 3)}</span>{" "}
                              {shortTime(s.start_time)}–{shortTime(s.end_time)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      <AccountStatusBadge profile={f} />
                    </TableCell>
                    <TableCell>
                      {elsewhere ? (
                        // Their account is managed by the Super Admin (and the campus they are set to): deactivating it
                        // here would also switch them off at their other schools.
                        <p className="text-right text-xs text-muted-foreground">Managed by IT</p>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          {isPending(f) ? <ResendInviteButton profileId={f.id} /> : null}
                          <ActiveToggleButton profileId={f.id} active={f.is_active} />
                        </div>
                      )}
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
