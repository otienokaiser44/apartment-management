"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { updateTicket } from "@/lib/services/maintenance";
import { staffTicketUpdateSchema } from "@/lib/validation/portal";
import type { FormState } from "@/types/forms";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** Owners, property managers and caretakers change a ticket's status and/or post a message. The database checks who may. */
export async function updateTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = staffTicketUpdateSchema.safeParse({
    ticketId: text(formData, "ticketId"),
    status: text(formData, "status"),
    message: text(formData, "message"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await updateTicket(parsed.data.ticketId, parsed.data.status, parsed.data.message);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/landlord/maintenance");
  revalidatePath(`/landlord/maintenance/${parsed.data.ticketId}`);
  return { status: "success", message: "Update posted. The tenant has been notified." };
}
