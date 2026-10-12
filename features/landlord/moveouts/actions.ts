"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { advanceVacateNotice } from "@/lib/services/moveouts";
import { endTenancyToday } from "@/lib/services/tenancies";
import { acknowledgeSchema, inspectionSchema, refundSchema } from "@/lib/validation/portal";
import type { FormState } from "@/types/forms";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const invalid = (fieldErrors: FormState["fieldErrors"]): FormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors,
});

const refresh = () => revalidatePath("/landlord/move-outs");

/** submitted -> approved. Tells the tenant their notice was received. */
export async function acknowledgeVacateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = acknowledgeSchema.safeParse({ noticeId: text(formData, "noticeId"), note: text(formData, "note") });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await advanceVacateNotice(parsed.data.noticeId, "acknowledge", { note: parsed.data.note });
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "success", message: "Notice acknowledged." };
}

/** approved -> inspection_pending. The time is read as Nairobi time. */
export async function scheduleInspectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = inspectionSchema.safeParse({
    noticeId: text(formData, "noticeId"),
    inspectionAt: text(formData, "inspectionAt"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await advanceVacateNotice(parsed.data.noticeId, "schedule_inspection", { inspectionAt: parsed.data.inspectionAt, note: parsed.data.note });
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "success", message: "Inspection scheduled. The tenant has been notified." };
}

/** inspection_pending -> deposit_refunded. Refund plus deductions cannot exceed the deposit (the database checks). */
export async function recordRefundAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = refundSchema.safeParse({
    noticeId: text(formData, "noticeId"),
    refundAmount: text(formData, "refundAmount"),
    deductions: text(formData, "deductions"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await advanceVacateNotice(parsed.data.noticeId, "record_refund", {
    refundAmount: parsed.data.refundAmount,
    deductions: parsed.data.deductions,
    note: parsed.data.note,
  });
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "success", message: "Deposit refund recorded." };
}

/** After the refund: ends the tenancy (the existing action), which returns the unit to vacant. History is kept. */
export async function endTenancyAction(tenancyId: string) {
  await requireRole(OPERATOR_ROLES);
  const r = await endTenancyToday(tenancyId);
  if (r.ok) {
    refresh();
    revalidatePath("/landlord", "layout");
  }
  return r.ok ? { ok: true, message: "Tenancy ended. The unit is vacant again." } : { ok: false, message: r.message };
}
