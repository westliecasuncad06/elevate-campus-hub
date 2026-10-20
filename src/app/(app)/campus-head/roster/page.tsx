import type { Metadata } from "next";
import Link from "next/link";
import { LiveFilters, LiveSearch } from "@/components/live-filters";
import { EmptyState, PageHeader, StatCard } from "@/components/page-header";
import { RemoveRosterButton } from "@/components/roster/remove-roster-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { searchTerm } from "@/lib/postgrest";
import { fullName } from "@/lib/types";

export const metadata: Metadata = { title: "Roster" };

interface RosterRow {
  id: string;
  full_name: string;
  gender: "male" | "female" | null;
  year_level: number | null;
  course: string | null;
  claimed_by: string | null;
  claimed: { first_name: string; last_name: string } | null;
}

const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "waiting", label: "Not registered yet" },
  { value: "registered", label: "Registered" },
] as const;

export default async function RosterPage({ searchParams }: PageProps<"/campus-head/roster">) {
  const actor = await requireRole("campus_head");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const filter = FILTERS.some((f) => f.value === params.filter) ? (params.filter as (typeof FILTERS)[number]["value"]) : "all";

  const supabase = await createClient();
  const [{ count: total }, { count: registered }] = await Promise.all([
    supabase.from("roster_students").select("id", { count: "exact", head: true }).eq("campus_id", actor.campus_id!),
    supabase.from("roster_students").select("id", { count: "exact", head: true }).eq("campus_id", actor.campus_id!).not("claimed_by", "is", null),
  ]);

  let query = supabase
    .from("roster_students")
    .select("id, full_name, gender, year_level, course, claimed_by, claimed:profiles!roster_students_claimed_by_fkey(first_name, last_name)")
    .eq("campus_id", actor.campus_id!)
    .order("full_name")
    .limit(500);
  if (filter === "waiting") query = query.is("claimed_by", null);
  if (filter === "registered") query = query.not("claimed_by", "is", null);
  if (searchTerm(q)) query = query.ilike("full_name", `%${searchTerm(q)}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as RosterRow[];

  const all = total ?? 0;
  const done = registered ?? 0;
  // The status buttons keep whatever is typed in the search box.
  const href = (value: string) => {
    const params = new URLSearchParams();
    if (value !== "all") params.set("filter", value);
    if (q) params.set("q", q);
    const query = params.toString();
    return "/campus-head/roster" + (query ? "?" + query : "");
  };

  return (
    <>
      <PageHeader
        title="Roster"
        description="The students your campus already has on its list. When a student is registered with the same name, they are linked here automatically (the order of the names and capital letters don't matter)."
      />

      {all === 0 ? (
        <EmptyState
          title="The roster is empty"
          hint="Ask IT to load your campus's list of student names. After that, each student registered with a matching name is linked to it."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="On the roster" value={all} />
            <StatCard label="Registered" value={done} hint="Linked to an account" />
            <StatCard label="Not registered yet" value={all - done} />
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            {/* Filters as you type: no Search button. */}
            <LiveFilters params={["q"]} className="flex min-w-64 flex-1 items-end gap-2 !border-0 !bg-transparent !p-0">
              <LiveSearch placeholder="Name" className="min-w-52 flex-1" />
            </LiveFilters>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button key={f.value} variant={filter === f.value ? "default" : "outline"} nativeButton={false} render={<Link href={href(f.value)} />}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No names match" hint="Try a different search or filter." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Year / course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="capitalize">{r.gender ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {[r.year_level ? `Year ${r.year_level}` : null, r.course].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        {r.claimed_by ? (
                          <div>
                            <Badge variant="secondary">Registered</Badge>
                            {r.claimed ? <p className="mt-1 text-xs text-muted-foreground">as {fullName(r.claimed)}</p> : null}
                          </div>
                        ) : (
                          <Badge className="bg-brand/25 text-brand-ink hover:bg-brand/25">Not registered yet</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.claimed_by ? null : <RemoveRosterButton rosterId={r.id} name={r.full_name} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {all > rows.length && !q && filter === "all" ? (
            <p className="mt-3 text-xs text-muted-foreground">Showing the first {rows.length} of {all} names. Use search to find the rest.</p>
          ) : null}
        </>
      )}
    </>
  );
}
