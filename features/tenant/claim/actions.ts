"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { claimInvitation } from "@/lib/services/onboarding";
import { inviteTokenSchema } from "@/lib/validation/onboarding";
import type { FormState } from "@/types/forms";

/** Scenario B: binds the signed-in tenant to the invited unit. The token is the only input; it is single-use. */
export async function claimUnitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("tenant");
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { status: "error", message: "That invitation link is invalid." };
  const r = await claimInvitation(token.data);
  if (!r.ok) return { status: "error", message: r.message };
  redirect("/tenant");
}
