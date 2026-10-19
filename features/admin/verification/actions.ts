"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { reviewVerification } from "@/lib/services/admin";
import { reviewSchema } from "@/lib/validation/verification";
import type { FormState } from "@/types/forms";

const DONE: Record<string, string> = {
  under_review: "Marked as under review.",
  approved: "Approved. The landlord has been notified.",
  rejected: "Rejected. The landlord has been notified with your reason.",
};

/** Admin decision on a verification request. The database function re-checks is_admin() and writes the audit entry. */
export async function reviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("admin");
  const parsed = reviewSchema.safeParse({
    requestId: formData.get("requestId") ?? "",
    decision: formData.get("decision") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await reviewVerification(parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/admin");
  revalidatePath("/admin/verification", "layout");
  return { status: "success", message: DONE[parsed.data.decision] };
}
