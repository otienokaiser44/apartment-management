"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { submitVacateNotice, withdrawVacateNotice } from "@/lib/services/moveouts";
import { vacateSchema } from "@/lib/validation/portal";
import type { FormState } from "@/types/forms";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** A formal move-out notice: a mandatory date and reason; refund details are optional. */
export async function submitVacateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("tenant");
  if (formData.get("confirm") !== "on") {
    return { status: "error", message: "Please confirm that this is a formal notice.", fieldErrors: { confirm: ["Tick the box to continue."] } };
  }
  const parsed = vacateSchema.safeParse({
    tenancyId: text(formData, "tenancyId"),
    moveOutDate: text(formData, "moveOutDate"),
    reason: text(formData, "reason"),
    refundDetails: text(formData, "refundDetails"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await submitVacateNotice(parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/tenant", "layout");
  return { status: "success", message: "Your notice was sent to your landlord." };
}

export async function withdrawVacateAction(noticeId: string) {
  await requireRole("tenant");
  const r = await withdrawVacateNotice(noticeId);
  if (r.ok) revalidatePath("/tenant", "layout");
  return r.ok ? { ok: true, message: "Notice withdrawn." } : { ok: false, message: r.message };
}
