"use server";

import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { inviteOne } from "@/lib/services/tenancies";
import { linkExistingSchema } from "@/lib/validation/onboarding";

export type InviteOneState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; claimUrl: string; email: string | null; phone: string | null };

/** "Assign / invite tenant": creates a single-unit token invite and returns the claim link (shown once). */
export async function inviteOneAction(_prev: InviteOneState, formData: FormData): Promise<InviteOneState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = linkExistingSchema.safeParse({
    unitId: formData.get("unitId"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return { status: "error", message: first ?? "Check the details and try again." };
  }
  const r = await inviteOne(parsed.data.unitId, parsed.data.email, parsed.data.phone);
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "created", claimUrl: r.data.claimUrl, email: r.data.email, phone: r.data.phone };
}
