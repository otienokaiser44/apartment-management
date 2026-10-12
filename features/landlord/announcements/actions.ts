"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { sendAnnouncement } from "@/lib/services/billing";
import { announcementSchema } from "@/lib/validation/billing";
import type { FormState } from "@/types/forms";

/** Sends an announcement to a filtered tenant audience. Recipients are resolved by the database at send time. */
export async function sendAnnouncementAction(propertyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = announcementSchema.safeParse({
    title: formData.get("title") ?? "",
    message: formData.get("message") ?? "",
    audience: formData.get("audience") ?? "",
    category: formData.get("category") ?? "general",
    value: formData.get("value") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await sendAnnouncement(propertyId, parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/landlord/properties/${propertyId}`);
  return { status: "success", message: "Announcement sent. Matching tenants see it on their dashboard now." };
}
