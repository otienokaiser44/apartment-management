"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { inviteStaff, removeStaff, revokeStaffInvite } from "@/lib/services/staff";
import { inviteStaffSchema } from "@/lib/validation/staff";

export type InviteStaffState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[] | undefined> }
  | { status: "created"; inviteUrl: string; email: string };

const refresh = () => {
  revalidatePath("/landlord/managers");
  revalidatePath("/landlord/properties", "layout");
};

// Staff management is the owner's alone: managers and caretakers cannot delegate further.

/** Creates a staff invitation and returns the invite link once (delivery by email/SMS can be wired in later). */
export async function inviteStaffAction(_prev: InviteStaffState, formData: FormData): Promise<InviteStaffState> {
  await requireRole("landlord");
  const parsed = inviteStaffSchema.safeParse({
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
    propertyIds: formData.getAll("propertyIds").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await inviteStaff(parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  refresh();
  return { status: "created", inviteUrl: r.data.inviteUrl, email: parsed.data.email };
}

export async function revokeStaffInviteAction(invitationId: string) {
  await requireRole("landlord");
  const r = await revokeStaffInvite(invitationId);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

export async function removeStaffAction(staffId: string) {
  await requireRole("landlord");
  const r = await removeStaff(staffId);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
