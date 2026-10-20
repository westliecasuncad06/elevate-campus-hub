import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/postgrest";
import type { ChatMessage } from "@/lib/types";

/** The newest messages between two people, oldest first. RLS also restricts this to the viewer's own messages. */
export async function loadConversation(supabase: SupabaseClient, meId: string, otherId: string, limit = 200): Promise<ChatMessage[]> {
  // Both ids go into a filter string below, so they must be real UUIDs (never anything with filter syntax in it).
  if (!isUuid(meId) || !isUuid(otherId)) return [];
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .or(`and(sender_id.eq.${meId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${meId})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as ChatMessage[]).reverse();
}
