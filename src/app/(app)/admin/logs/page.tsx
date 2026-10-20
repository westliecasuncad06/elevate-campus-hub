import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "System logs" };

interface LogRow {
  id: string;
  event: string;
  level: "info" | "warn" | "error";
  detail: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  keep_alive: "Keep-alive ping",
  password_reset: "Password reset by IT",
  report_submitted: "Report sent to Google",
  report_failed: "Report failed to send",
};

export default async function LogsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_logs")
    .select("id, event, level, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const logs = (data ?? []) as LogRow[];

  return (
    <>
      <PageHeader title="System logs" description="The latest 100 events: keep-alive pings, password resets and report submissions." />
      {logs.length === 0 ? (
        <EmptyState title="Nothing logged yet" hint="Events appear here as the system is used." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell className="font-medium">{EVENT_LABEL[log.event] ?? log.event}</TableCell>
                  <TableCell>
                    <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "outline" : "secondary"}>
                      {log.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                    {log.detail ? JSON.stringify(log.detail) : "—"}
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
