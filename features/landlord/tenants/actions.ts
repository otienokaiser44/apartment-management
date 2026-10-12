"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import {
  approveUnitRequest, cancelTenantLink, inviteRoster, rejectUnitRequest, requestTenantLink,
  type InvitationIssued,
} from "@/lib/services/onboarding";
import { linkExistingSchema, precheckRoster, type RosterRow, type RosterRowError } from "@/lib/validation/onboarding";
import type { FormState } from "@/types/forms";

export type RosterResult =
  | { status: "created"; issued: InvitationIssued[] }
  | { status: "error"; message: string; rowErrors?: RosterRowError[] };

const refresh = (propertyId: string) => revalidatePath(`/landlord/properties/${propertyId}`);

/** Scenario A. Validates, then creates every invitation atomically (none on any error). */
export async function inviteRosterAction(propertyId: string, roster: RosterRow[]): Promise<RosterResult> {
  await requireRole(OPERATOR_ROLES);
  const problems = precheckRoster(roster);
  if (problems.length) {
    return { status: "error", message: `${problems.length} problem${problems.length === 1 ? "" : "s"} found. Nothing was saved.`, rowErrors: problems };
  }
  const result = await inviteRoster(propertyId, roster);
  if (!result.ok) return { status: "error", message: result.message, rowErrors: result.rowErrors };
  refresh(propertyId);
  return { status: "created", issued: result.data };
}

/** Scenario C. The tenant must accept before any tenancy exists. */
export async function linkExistingTenantAction(propertyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = linkExistingSchema.safeParse({
    unitId: formData.get("unitId"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await requestTenantLink(parsed.data.unitId, parsed.data.email, parsed.data.phone);
  if (!result.ok) return { status: "error", message: result.message };
  refresh(propertyId);
  return { status: "success", message: "Request sent. The tenant will see it on their dashboard." };
}

export async function cancelLinkAction(propertyId: string, requestId: string) {
  await requireRole(OPERATOR_ROLES);
  const r = await cancelTenantLink(requestId);
  if (r.ok) refresh(propertyId);
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

/** Scenario D. Approve (-> pending tenancy, then move-in confirmed -> active). */
export async function approveRequestAction(propertyId: string, applicationId: string) {
  await requireRole(OPERATOR_ROLES);
  const r = await approveUnitRequest(applicationId);
  if (!r.ok) return { ok: false, message: r.message };
  refresh(propertyId);
  return r.data.active
    ? { ok: true }
    : { ok: false, message: "Approved, but move-in could not be confirmed yet. Confirm it from the tenancy later." };
}

export async function rejectRequestAction(propertyId: string, applicationId: string) {
  await requireRole(OPERATOR_ROLES);
  const r = await rejectUnitRequest(applicationId, "Declined by landlord");
  if (r.ok) refresh(propertyId);
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
