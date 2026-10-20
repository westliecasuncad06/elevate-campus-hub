"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { markConversationReadAction, sendMessageAction } from "@/app/actions/chat";
import type { ChatMessage } from "@/lib/types";

/** One conversation. New messages arrive live over a Supabase Realtime subscription. */
export function ChatThread({
  meId,
  otherId,
  otherName,
  initial,
  timezone,
}: {
  meId: string;
  otherId: string;
  otherName: string;
  initial: ChatMessage[];
  timezone: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark what's already here as read.
  useEffect(() => {
    if (initial.some((m) => m.sender_id === otherId && !m.is_read)) {
      void markConversationReadAction(otherId);
    }
  }, [initial, otherId]);

  // Live updates: only messages addressed to me, and only from this conversation partner.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Subscribe on the next tick: if React mounts, unmounts and re-mounts straight away (dev
    // StrictMode, fast navigation), the first attempt is cancelled before it ever joins, so a
    // closing channel can't swallow the real subscription.
    const timer = setTimeout(() => {
      channel = supabase
        .channel(`chat-${meId}-${otherId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `receiver_id=eq.${meId}` },
          (payload) => {
            const incoming = payload.new as ChatMessage;
            if (incoming.sender_id !== otherId) return;
            setMessages((current) => (current.some((m) => m.id === incoming.id) ? current : [...current, incoming]));
            void markConversationReadAction(otherId);
          },
        )
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("Chat live updates unavailable:", status, error?.message ?? "");
          }
        });
    }, 0);

    return () => {
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [meId, otherId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const result = await sendMessageAction(otherId, text);
    setSending(false);
    if (result.ok && result.data) {
      setMessages((current) => [...current, result.data!]);
      setDraft("");
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-96 flex-col overflow-hidden rounded-2xl border bg-card lg:h-[calc(100dvh-11rem)]">
      <div className="border-b px-4 py-3">
        <p className="font-semibold">{otherName}</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label={`Conversation with ${otherName}`}>
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello to {otherName.split(" ")[0]}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{m.message}</p>
                  <p className={cn("mt-1 text-[0.7rem] tabular-nums", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {formatTime(m.created_at, timezone)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-32 min-h-10 resize-none"
        />
        <Button type="submit" size="icon-lg" disabled={sending || !draft.trim()} aria-label="Send message">
          <SendHorizontalIcon />
        </Button>
      </form>
    </div>
  );
}
