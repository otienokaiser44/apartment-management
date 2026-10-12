"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { cancelTicket, commentOnTicket, submitTicket } from "@/lib/services/maintenance";
import { commentSchema, ticketSchema } from "@/lib/validation/portal";
import type { FormState } from "@/types/forms";

export type TicketFormState = FormState & { ticketId?: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** Creates the ticket. Attachments are uploaded by the browser afterwards, against the returned id. */
export async function submitTicketAction(formData: FormData): Promise<TicketFormState> {
  await requireRole("tenant");
  const parsed = ticketSchema.safeParse({
    tenancyId: text(formData, "tenancyId"),
    title: text(formData, "title"),
    category: text(formData, "category"),
    priority: text(formData, "priority"),
    description: text(formData, "description"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await submitTicket(parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/tenant", "layout");
  return { status: "success", message: "Ticket submitted.", ticketId: r.data.id };
}

export async function commentOnTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("tenant");
  const parsed = commentSchema.safeParse({ ticketId: text(formData, "ticketId"), message: text(formData, "message") });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await commentOnTicket(parsed.data.ticketId, parsed.data.message);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/tenant/tickets/${parsed.data.ticketId}`);
  return { status: "success", message: "Message sent." };
}

export async function cancelTicketAction(ticketId: string) {
  await requireRole("tenant");
  const r = await cancelTicket(ticketId);
  if (r.ok) {
    revalidatePath("/tenant", "layout");
    revalidatePath(`/tenant/tickets/${ticketId}`);
  }
  return r.ok ? { ok: true, message: "Ticket cancelled." } : { ok: false, message: r.message };
}
