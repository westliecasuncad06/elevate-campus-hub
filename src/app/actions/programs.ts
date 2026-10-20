"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Program } from "@/lib/types";

const FORBIDDEN: ActionResult = { ok: false, error: "You don't have permission to do that." };

function refresh() {
  revalidatePath("/", "layout");
}

/** Super Admin: add a program (campus left blank = available to every campus). */
export async function createProgramAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  // Keep the casing as typed: some codes are mixed-case (BSCpE).
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const campus = String(formData.get("campus_id") ?? "");
  const campusId = campus && campus !== "global" ? campus : null;

  if (!/^[A-Za-z0-9 &/-]{2,16}$/.test(code)) return { ok: false, error: "Program code must be 2–16 letters or numbers (for example BSIT)." };
  if (!name) return { ok: false, error: "Enter the program name." };

  const supabase = await createClient();
  let scope = supabase.from("programs").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  scope = campusId ? scope.eq("campus_id", campusId) : scope.is("campus_id", null);
  const { data: last } = await scope.maybeSingle<{ sort_order: number }>();

  const { error } = await supabase
    .from("programs")
    .insert({ code, name, campus_id: campusId, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${code} already exists for that campus.` };
    return { ok: false, error: error.message };
  }

  refresh();
  return { ok: true, message: `${code} added.` };
}

export async function updateProgramAction(
  programId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[A-Za-z0-9 &/-]{2,16}$/.test(code)) return { ok: false, error: "Program code must be 2–16 letters or numbers." };
  if (!name) return { ok: false, error: "Enter the program name." };

  const supabase = await createClient();
  const { error } = await supabase.from("programs").update({ code, name }).eq("id", programId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${code} already exists for that campus.` };
    return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true, message: "Program updated." };
}

export async function setProgramActiveAction(programId: string, active: boolean): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const supabase = await createClient();
  const { error } = await supabase.from("programs").update({ is_active: active }).eq("id", programId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, message: active ? "Program activated." : "Program deactivated." };
}

/** Moves a program one step up or down within its campus (or the global list). */
export async function moveProgramAction(programId: string, direction: "up" | "down"): Promise<ActionResult> {
  const actor = await getActor("super_admin");
  if (!actor) return FORBIDDEN;

  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select("*").eq("id", programId).maybeSingle<Program>();
  if (!program) return { ok: false, error: "Program not found." };

  let scope = supabase.from("programs").select("id, sort_order, code").order("sort_order").order("code");
  scope = program.campus_id ? scope.eq("campus_id", program.campus_id) : scope.is("campus_id", null);
  const { data: siblings } = await scope;
  const list = (siblings ?? []) as Pick<Program, "id" | "sort_order" | "code">[];

  const index = list.findIndex((p) => p.id === programId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return { ok: true };

  // Re-number the whole scope so ties never make the order ambiguous.
  [list[index], list[swapWith]] = [list[swapWith], list[index]];
  for (const [i, p] of list.entries()) {
    if (p.sort_order !== i + 1) {
      const { error } = await supabase.from("programs").update({ sort_order: i + 1 }).eq("id", p.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  refresh();
  return { ok: true };
}
