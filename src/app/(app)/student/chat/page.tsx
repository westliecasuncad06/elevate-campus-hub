import type { Metadata } from "next";
import { ChatThread } from "@/components/chat/chat-thread";
import { EmptyState, PageHeader } from "@/components/page-header";
import { getCampus, requireRole } from "@/lib/auth";
import { loadConversation } from "@/lib/chat";
import { getMyFacilitator } from "@/lib/my-facilitator";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/types";

export const metadata: Metadata = { title: "Chat" };

export default async function StudentChatPage() {
  const profile = await requireRole("student");
  const campus = await getCampus(profile.campus_id);
  const supabase = await createClient();

  const facilitator = await getMyFacilitator(supabase);

  let body: React.ReactNode;
  if (!facilitator) {
    body = (
      <EmptyState
        title="No facilitator yet"
        hint="You'll be able to chat as soon as a facilitator takes your attendance at the next meeting."
      />
    );
  } else if (facilitator.gender !== profile.gender) {
    body = (
      <EmptyState
        title="Chat isn't available with your facilitator"
        hint="Chat only works between people of the same gender. Ask your Campus Head to assign you a different facilitator."
      />
    );
  } else {
    const messages = await loadConversation(supabase, profile.id, facilitator.id);
    body = (
      <ChatThread
        meId={profile.id}
        otherId={facilitator.id}
        otherName={fullName(facilitator)}
        initial={messages}
        timezone={campus?.timezone ?? "Asia/Manila"}
      />
    );
  }

  return (
    <>
      <PageHeader title="Chat" description="Ask questions, get encouragement, or plan your next D-Group with your facilitator." />
      {body}
    </>
  );
}
