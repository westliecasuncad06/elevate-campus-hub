import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel Cron calls this every 3 days (see vercel.json) so the free Supabase project never
// reaches 7 days without a query and gets paused.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" automatically when CRON_SECRET is set.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("campuses").select("id").limit(1);

  if (error) {
    await admin.from("system_logs").insert({ event: "keep_alive", level: "error", detail: { error: error.message } });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Housekeeping while we're here: notifications older than 60 days aren't useful any more.
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { error: cleanupError } = await admin.from("notifications").delete().lt("created_at", cutoff);
  // Old sign-in attempt counters (rate limits) are of no use once their window has passed.
  const { data: limitsRemoved, error: limitsError } = await admin.rpc("rate_limits_cleanup");
  // Expired sign-in codes, "this session passed" records and trusted browsers likewise.
  const { data: codesRemoved } = await admin.rpc("email_code_cleanup");

  await admin.from("system_logs").insert({
    event: "keep_alive",
    level: "info",
    detail: {
      source: "cron",
      rate_limit_rows_removed: typeof limitsRemoved === "number" ? limitsRemoved : null,
      sign_in_code_rows_removed: typeof codesRemoved === "number" ? codesRemoved : null,
      ...(cleanupError ? { cleanup_error: cleanupError.message } : {}),
      ...(limitsError ? { rate_limit_cleanup_error: limitsError.message } : {}),
    },
  });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
