import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { QrCard } from "@/components/qr/qr-card";
import { Button } from "@/components/ui/button";
import { getCampus, requireRole } from "@/lib/auth";
import { DAY_NAMES } from "@/lib/dates";
import { getMyFacilitator } from "@/lib/my-facilitator";
import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/types";

export const metadata: Metadata = { title: "My card" };

interface Slot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

function shortTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hour = h % 12 || 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
}

export default async function StudentHome() {
  const profile = await requireRole("student");
  const campus = await getCampus(profile.campus_id);
  const supabase = await createClient();

  const [{ data: program }, facilitator] = await Promise.all([
    profile.program_id
      ? supabase.from("programs").select("code, name").eq("id", profile.program_id).maybeSingle<{ code: string; name: string }>()
      : Promise.resolve({ data: null }),
    getMyFacilitator(supabase),
  ]);

  const { data: slotRows } = facilitator
    ? await supabase
        .from("facilitator_availability")
        .select("day_of_week, start_time, end_time")
        .eq("facilitator_id", facilitator.id)
        .eq("is_available", true)
        .order("day_of_week")
    : { data: [] };
  const slots = (slotRows ?? []) as Slot[];

  const detail = [program?.code, profile.year_level ? `Year ${profile.year_level}` : null, profile.student_number]
    .filter(Boolean)
    .join(" · ");
  const canChat = facilitator && facilitator.gender === profile.gender;

  return (
    <>
      <PageHeader title={`Hi, ${profile.first_name}`} description="Your attendance card and your facilitator." />

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        {profile.qr_token ? (
          <QrCard
            token={profile.qr_token}
            name={fullName(profile)}
            detail={detail || "Student"}
            campusName={campus?.name ?? "Campus"}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Your QR code isn&apos;t ready yet. Ask your Campus Head to check your account.
          </p>
        )}

        <section aria-labelledby="facilitator-heading" className="rounded-2xl border bg-card p-5">
          <h2 id="facilitator-heading" className="text-lg font-semibold">
            Your facilitator
          </h2>
          {facilitator ? (
            <>
              <p className="mt-3 text-2xl font-bold tracking-tight">{fullName(facilitator)}</p>

              <h3 className="mt-5 text-sm font-semibold">When they&apos;re available</h3>
              {slots.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">They haven&apos;t shared their hours yet.</p>
              ) : (
                <ul className="mt-2 grid gap-1 text-sm">
                  {slots.map((s) => (
                    <li key={s.day_of_week} className="flex justify-between gap-4 rounded-lg bg-muted px-3 py-1.5">
                      <span className="font-medium">{DAY_NAMES[s.day_of_week]}</span>
                      <span className="tabular-nums">
                        {shortTime(s.start_time)} – {shortTime(s.end_time)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {canChat ? (
                <Button className="mt-5" nativeButton={false} render={<Link href="/student/chat" />}>
                  <MessageCircleIcon />
                  Message {facilitator.first_name}
                </Button>
              ) : (
                <p className="mt-5 rounded-lg bg-brand/20 px-3 py-2 text-sm text-brand-ink">
                  Chat only works with a facilitator of the same gender. Ask your Campus Head to assign you a different one.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              You don&apos;t have a facilitator yet. You&apos;ll get one automatically when a facilitator takes your
              attendance at the next meeting.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
