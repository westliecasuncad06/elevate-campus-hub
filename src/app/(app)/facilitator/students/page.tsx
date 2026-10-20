import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { AccountStatusBadge } from "@/components/accounts/status-badge";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { fullName, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "My students" };

type StudentRow = Profile & { program: { code: string } | null };

export default async function MyStudentsPage() {
  const profile = await requireRole("facilitator");
  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("facilitator_students")
    .select("student_id")
    .eq("facilitator_id", profile.id)
    .eq("is_active", true);
  const ids = (assignments ?? []).map((a) => a.student_id as string);

  const [{ data: studentRows }, { data: logs }] = ids.length
    ? await Promise.all([
        supabase.from("profiles").select("*, program:programs(code)").in("id", ids).order("first_name"),
        supabase
          .from("attendance_logs")
          .select("student_id, log_date")
          .in("student_id", ids)
          .order("log_date", { ascending: false })
          .limit(1000),
      ])
    : [{ data: [] }, { data: [] }];

  const students = (studentRows ?? []) as StudentRow[];
  const visits = new Map<string, { last: string; count: number }>();
  for (const l of logs ?? []) {
    const id = l.student_id as string;
    const entry = visits.get(id);
    if (entry) entry.count += 1;
    else visits.set(id, { last: l.log_date as string, count: 1 });
  }

  return (
    <>
      <PageHeader title="My students" description="Students assigned to you when you took their attendance." />

      {students.length === 0 ? (
        <EmptyState
          title="No students yet"
          hint="When you mark a student's attendance and they don't have a facilitator, they become yours."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Last visit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Chat</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const visit = visits.get(s.id);
                const canChat = s.gender === profile.gender;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="font-medium">{fullName(s)}</p>
                      <p className="text-xs text-muted-foreground">{s.phone ?? s.email}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.program?.code ?? "—"}
                      {s.year_level ? ` · Year ${s.year_level}` : ""}
                    </TableCell>
                    <TableCell className="tabular-nums">{visit?.count ?? 0}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{visit ? formatDate(visit.last) : "—"}</TableCell>
                    <TableCell>
                      <AccountStatusBadge profile={s} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canChat ? (
                        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/facilitator/chat?with=${s.id}`} />}>
                          <MessageCircleIcon />
                          Chat
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Chat off (different gender)</span>
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
