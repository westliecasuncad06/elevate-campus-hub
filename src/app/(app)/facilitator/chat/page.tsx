import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { ChatThread } from "@/components/chat/chat-thread";
import { EmptyState, PageHeader } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { loadConversation } from "@/lib/chat";
import { formatTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { fullName, type ChatMessage, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Chat" };

export default async function FacilitatorChatPage({ searchParams }: PageProps<"/facilitator/chat">) {
  const profile = await requireRole("facilitator");
  const campus = await getCampus(profile.campus_id);
  const timezone = campus?.timezone ?? "Asia/Manila";
  const params = await searchParams;
  const withId = typeof params.with === "string" ? params.with : null;

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("facilitator_students")
    .select("student_id")
    .eq("facilitator_id", profile.id)
    .eq("is_active", true);
  const studentIds = (assignments ?? []).map((a) => a.student_id as string);

  const { data: studentRows } = studentIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, gender").in("id", studentIds).order("first_name")
    : { data: [] };
  const students = (studentRows ?? []) as Pick<Profile, "id" | "first_name" | "last_name" | "gender">[];

  // Same-gender only. (The database enforces this too; this keeps the list honest.)
  const contacts = students.filter((s) => s.gender === profile.gender);
  const skipped = students.length - contacts.length;

  const { data: recent } = await supabase
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  const recentMessages = (recent ?? []) as ChatMessage[];
  const unread = new Map<string, number>();
  const last = new Map<string, ChatMessage>();
  for (const m of recentMessages) {
    const other = m.sender_id === profile.id ? m.receiver_id : m.sender_id;
    if (!last.has(other)) last.set(other, m);
    if (m.receiver_id === profile.id && !m.is_read) unread.set(other, (unread.get(other) ?? 0) + 1);
  }

  const selected = contacts.find((c) => c.id === withId) ?? null;
  const messages = selected ? await loadConversation(supabase, profile.id, selected.id) : [];

  return (
    <>
      <PageHeader title="Chat" description="Message the students you facilitate." />

      {contacts.length === 0 ? (
        <EmptyState
          title="No one to chat with yet"
          hint={
            skipped > 0
              ? "Your assigned students are a different gender, so chat is off for them. Ask your Campus Head to reassign."
              : "Students are assigned to you automatically when you take their attendance."
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Students" className={cn("grid content-start gap-2", selected && "hidden lg:grid")}>
            {contacts.map((c) => {
              const lastMessage = last.get(c.id);
              const count = unread.get(c.id) ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/facilitator/chat?with=${c.id}`}
                  aria-current={c.id === selected?.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent/40",
                    c.id === selected?.id && "border-primary/40 bg-accent/50",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {c.first_name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{fullName(c)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lastMessage
                        ? `${lastMessage.sender_id === profile.id ? "You: " : ""}${lastMessage.message}`
                        : "No messages yet"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {lastMessage ? (
                      <span className="text-[0.7rem] text-muted-foreground tabular-nums">
                        {formatTime(lastMessage.created_at, timezone)}
                      </span>
                    ) : null}
                    {count > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                        {count}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
            {skipped > 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                {skipped} assigned {skipped === 1 ? "student isn't" : "students aren't"} listed because chat is only for the same gender.
              </p>
            ) : null}
          </nav>

          <div className={cn(!selected && "hidden lg:block")}>
            {selected ? (
              <>
                <Link href="/facilitator/chat" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
                  <ArrowLeftIcon className="size-4" />
                  All students
                </Link>
                <ChatThread
                  key={selected.id}
                  meId={profile.id}
                  otherId={selected.id}
                  otherName={fullName(selected)}
                  initial={messages}
                  timezone={timezone}
                />
              </>
            ) : (
              <div className="hidden h-full min-h-72 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground lg:flex">
                Pick a student to start chatting.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
