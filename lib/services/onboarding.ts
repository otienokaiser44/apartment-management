import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RosterRow, RosterRowError } from "@/lib/validation/onboarding";
import { failure, rowErrorsFrom, type Result } from "./errors";
import { claimUrl, deliverInvitation } from "./invitationDelivery";

export type InvitationIssued = { unitNumber: string; name: string | null; email: string | null; phone: string | null; claimUrl: string };

/**
 * Scenario A. One RPC call = one transaction: either every roster row becomes an invitation or none does.
 * On failure `rowErrors` lists every bad row so the landlord can fix the whole file in one pass.
 */
export async function inviteRoster(
  propertyId: string,
  roster: RosterRow[],
): Promise<{ ok: true; data: InvitationIssued[] } | { ok: false; message: string; rowErrors?: RosterRowError[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenant_invitations_bulk", { p_property_id: propertyId, p_roster: roster });
  if (error) {
    const rowErrors = rowErrorsFrom<RosterRowError>(error);
    return { ...failure(error, "Could not create the invitations. Nothing was saved."), rowErrors };
  }
  const issued = (data ?? []) as {
    unit_number: string; invitee_name: string | null; invitee_email: string | null; invitee_phone: string | null; token: string;
  }[];
  const result: InvitationIssued[] = [];
  for (const row of issued) {
    const item = {
      unitNumber: row.unit_number,
      name: row.invitee_name,
      email: row.invitee_email,
      phone: row.invitee_phone,
      claimUrl: await claimUrl(row.token),
    };
    // Delivery failure must not undo the (already committed) invitations; the landlord still sees the link.
    await deliverInvitation(item).catch(() => undefined);
    result.push(item);
  }
  return { ok: true, data: result };
}

/** Scenario B. Redeems an invite token for the signed-in tenant. */
export async function claimInvitation(token: string): Promise<Result<{ tenancyId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_tenant_invitation", { p_token: token });
  if (error) return failure(error, "That invitation is invalid or has expired.");
  return { ok: true, data: { tenancyId: data as string } };
}

/** Scenario C (landlord side). */
export async function requestTenantLink(unitId: string, email?: string, phone?: string): Promise<Result<{ requestId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_tenant_link", {
    p_unit_id: unitId,
    p_email: email ?? null,
    p_phone: phone ?? null,
  });
  if (error) return failure(error, "Could not send the link request.");
  return { ok: true, data: { requestId: data as string } };
}

export async function cancelTenantLink(requestId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_tenant_link_request", { p_request_id: requestId });
  return error ? failure(error, "Could not cancel the request.") : { ok: true, data: undefined };
}

/** Scenario C (tenant side). Accept returns the new tenancy id; reject returns null. */
export async function respondToTenantLink(requestId: string, accept: boolean): Promise<Result<{ tenancyId: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_tenant_link", { p_request_id: requestId, p_accept: accept });
  if (error) return failure(error, "Could not record your answer.");
  return { ok: true, data: { tenancyId: (data as string | null) ?? null } };
}

/** Scenario D (tenant side). */
export async function submitUnitRequest(propertyCode: string, unitNumber: string, message?: string): Promise<Result<{ applicationId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_unit_link_request", {
    p_property_code: propertyCode,
    p_unit_number: unitNumber,
    p_message: message ?? null,
  });
  if (error) return failure(error, "Could not send your request.");
  return { ok: true, data: { applicationId: data as string } };
}

/**
 * Scenario D (landlord side). approve_rental_application reserves the unit and creates a PENDING tenancy; confirm_move_in
 * then makes it ACTIVE. They are separate RPCs by design; if the second fails the approval stands and the landlord can
 * confirm move-in later.
 */
export async function approveUnitRequest(applicationId: string): Promise<Result<{ tenancyId: string; active: boolean }>> {
  const supabase = await createClient();
  const approved = await supabase.rpc("approve_rental_application", { p_application_id: applicationId });
  if (approved.error) return failure(approved.error, "Could not approve the request.");
  const tenancyId = approved.data as string;
  const moved = await supabase.rpc("confirm_move_in", { p_tenancy_id: tenancyId });
  return { ok: true, data: { tenancyId, active: !moved.error } };
}

export async function rejectUnitRequest(applicationId: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_rental_application", { p_application_id: applicationId, p_reason: reason });
  return error ? failure(error, "Could not reject the request.") : { ok: true, data: undefined };
}

// --- reads (RLS scopes every query to the caller) ---------------------------------------------------------

export type PendingLinkRequest = { id: string; unit_id: string; status: string; expires_at: string; unit_number: string; property_name: string };

export async function listPropertyLinkRequests(propertyId: string): Promise<PendingLinkRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_link_requests")
    .select("id, unit_id, status, expires_at, units!inner(unit_number, property_id, properties(name))")
    .eq("units.property_id", propertyId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  return flattenRequests(data);
}

type RequestRow = {
  id: string; unit_id: string; status: string; expires_at: string;
  units: { unit_number: string; properties: { name: string } | { name: string }[] | null } | { unit_number: string; properties: unknown }[] | null;
};

function flattenRequests(rows: unknown): PendingLinkRequest[] {
  return ((rows ?? []) as RequestRow[]).map((r) => {
    const unit = Array.isArray(r.units) ? r.units[0] : r.units;
    const prop = unit && (Array.isArray(unit.properties) ? unit.properties[0] : unit.properties);
    return {
      id: r.id, unit_id: r.unit_id, status: r.status, expires_at: r.expires_at,
      unit_number: unit?.unit_number ?? "?", property_name: (prop as { name?: string } | null)?.name ?? "",
    };
  });
}

export type PendingApplication = { id: string; message: string | null; unit_number: string };

export async function listPendingApplications(propertyId: string): Promise<PendingApplication[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rental_applications")
    .select("id, message, units!inner(unit_number, property_id)")
    .eq("units.property_id", propertyId)
    .eq("status", "pending")
    .order("created_at");
  const rows = (data ?? []) as unknown as {
    id: string; message: string | null; units: { unit_number: string } | { unit_number: string }[];
  }[];
  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    unit_number: (Array.isArray(r.units) ? r.units[0] : r.units)?.unit_number ?? "?",
  }));
}
