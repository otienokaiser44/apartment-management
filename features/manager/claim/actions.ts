"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { acceptStaffInvite } from "@/lib/services/staff";
import { staffTokenSchema } from "@/lib/validation/staff";
import type { FormState } from "@/types/forms";

/** Redeems a staff invitation for the signed-in manager account. The token is the only input and is single-use. */
export async function acceptStaffInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("manager");
  const token = staffTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { status: "error", message: "That invitation link is invalid." };
  const r = await acceptStaffInvite(token.data);
  if (!r.ok) return { status: "error", message: r.message };
  redirect("/landlord/properties");
}
