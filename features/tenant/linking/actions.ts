"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { respondToTenantLink, submitUnitRequest } from "@/lib/services/onboarding";
import { unitRequestSchema } from "@/lib/validation/onboarding";
import type { FormState } from "@/types/forms";

/** Scenario C, tenant side: accept (creates the tenancy) or reject a landlord's link request. */
export async function respondToLinkAction(requestId: string, accept: boolean) {
  await requireRole("tenant");
  const r = await respondToTenantLink(requestId, accept);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/tenant");
  return { ok: true };
}

/** Scenario D: ask to be linked to a unit by property code + unit number. The landlord must approve. */
export async function requestUnitLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("tenant");
  const parsed = unitRequestSchema.safeParse({
    propertyCode: formData.get("propertyCode") ?? "",
    unitNumber: formData.get("unitNumber") ?? "",
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await submitUnitRequest(parsed.data.propertyCode, parsed.data.unitNumber, parsed.data.message);
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "success", message: "Request sent. You will be notified when the landlord responds." };
}
