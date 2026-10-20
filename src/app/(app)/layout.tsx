import { AppShell, type BatchNavData } from "@/components/app-shell/app-shell";
import { getCampus, requireProfile } from "@/lib/auth";
import { getMyOpenBatches, pickBatch } from "@/lib/my-batches";
import { loadNotificationFeed } from "@/lib/notifications";
import { ROLE_HOME } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const campus = await getCampus(profile.campus_id);
  const supabase = await createClient();

  let unreadChat = 0;
  if (profile.role === "facilitator" || profile.role === "student") {
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", profile.id)
      .eq("is_read", false);
    unreadChat = count ?? 0;
  }

  const notifications = await loadNotificationFeed(supabase, 15);

  // Facilitators and Campus Heads run batches: list their open ones under Today.
  let batchNav: BatchNavData | null = null;
  if (profile.role === "facilitator" || profile.role === "campus_head") {
    const open = await getMyOpenBatches(profile.id);
    batchNav = {
      basePath: ROLE_HOME[profile.role],
      batches: open.map((b) => ({ id: b.id, number: b.number, pending: b.students.filter((s) => !s.engagement).length })),
      defaultId: pickBatch(open)?.id ?? null,
    };
  }

  const campusLabel = campus ? `${campus.code} · ${campus.name}` : "All campuses";

  return (
    <AppShell
      role={profile.role}
      userId={profile.id}
      userName={fullName(profile)}
      campusLabel={campusLabel}
      unreadChat={unreadChat}
      batchNav={batchNav}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
