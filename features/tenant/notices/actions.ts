"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { markNoticeRead } from "@/lib/services/billing";

export async function markNoticeReadAction(noticeId: string) {
  await requireRole("tenant");
  const r = await markNoticeRead(noticeId);
  if (r.ok) revalidatePath("/tenant", "layout");
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
