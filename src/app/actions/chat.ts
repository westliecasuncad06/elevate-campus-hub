"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ChatMessage } from "@/lib/types";

/** Send a message. The database policy is the real gate: assigned pair, same campus, same gender. */
export async function sendMessageAction(receiverId: string, message: string): Promise<ActionResult<ChatMessage>> {
  const actor = await getActor("facilitator", "student");
  if (!actor?.campus_id) return { ok: false, error: "Only facilitators and students can chat." };

  const text = message.trim();
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > 2000) return { ok: false, error: "Messages can be up to 2,000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ sender_id: actor.id, receiver_id: receiverId, campus_id: actor.campus_id, message: text })
    .select("*")
    .single<ChatMessage>();

  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "You can only chat with your assigned facilitator or student of the same gender." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data };
}

/** Marks everything the other person sent as read. */
export async function markConversationReadAction(otherId: string): Promise<ActionResult> {
  const actor = await getActor("facilitator", "student");
  if (!actor) return { ok: false, error: "Not allowed." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_messages")
    .update({ is_read: true })
    .eq("receiver_id", actor.id)
    .eq("sender_id", otherId)
    .eq("is_read", false);
  if (error) return { ok: false, error: error.message };

  // The bell's "new message" notification for this conversation is read too.
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", actor.id)
    .eq("group_key", `chat:${otherId}`)
    .eq("is_read", false);

  revalidatePath("/", "layout");
  return { ok: true };
}
