import "server-only";
import { createClient } from "@/lib/supabase/server";
import { failure, type Result } from "./errors";
import { claimUrl, deliverInvitation } from "./invitationDelivery";

export type SingleInvitation = { email: string | null; phone: string | null; claimUrl: string };

/** Single-unit token invite (the "Assign / Invite tenant" row action). The claim link is returned once. */
export async function inviteOne(unitId: string, email?: string, phone?: string): Promise<Result<SingleInvitation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_tenant_invitation", {
    p_unit_id: unitId,
    p_email: email ?? null,
    p_phone: phone ?? null,
  });
  if (error) return failure(error, "Could not create the invitation.");
  const item = { unitNumber: "", name: null, email: email ?? null, phone: phone ?? null, claimUrl: await claimUrl(data as string) };
  await deliverInvitation(item).catch(() => undefined);
  return { ok: true, data: { email: item.email, phone: item.phone, claimUrl: item.claimUrl } };
}

export type ActiveTenancy = {
  tenancy_id: string;
  unit_id: string;
  unit_number: string;
  tenant_name: string | null;
  start_date: string;
  monthly_rent: number;
  currency: string;
};

/** Active tenancies of a property. The landlord overview view is already scoped to the signed-in landlord. */
export async function listActiveTenancies(propertyId: string): Promise<ActiveTenancy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("landlord_tenancy_overview")
    .select("tenancy_id, unit_id, unit_number, tenant_name, start_date, monthly_rent, currency")
    .eq("property_id", propertyId)
    .eq("tenancy_status", "active")
    .order("unit_number");
  return (data ?? []) as ActiveTenancy[];
}

/** "Mark vacant" on an occupied unit: ends its active tenancy today (history is kept). */
export async function endTenancyToday(tenancyId: string): Promise<Result> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.rpc("end_tenancy", { p_tenancy_id: tenancyId, p_end_date: today, p_notes: null });
  return error ? failure(error, "Could not end the tenancy.") : { ok: true, data: undefined };
}
