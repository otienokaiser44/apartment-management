import "server-only";
import { createClient } from "@/lib/supabase/server";
import { statementStatus, type StatementStatus } from "@/lib/validation/portal";

// --- tenancies ------------------------------------------------------------------------------------------------------------------

export type MyTenancy = {
  tenancy_id: string;
  tenancy_status: "pending" | "active" | "ended" | "terminated" | "cancelled";
  start_date: string;
  end_date: string | null;
  monthly_rent: number;
  security_deposit: number;
  currency: string;
  unit_id: string;
  unit_number: string;
  property_id: string;
  property_name: string;
  address_line_1: string | null;
  city: string | null;
  landlord_name: string | null;
  landlord_business_name: string | null;
  landlord_email: string | null;
  landlord_phone: string | null;
  floor_number: number | null;
  unit_type: string | null;
};

/** The tenant's tenancies, current first. Floor and unit type come from the unit (readable once a tenancy exists). */
export async function getMyTenancies(): Promise<MyTenancy[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_tenancy_overview")
    .select(
      "tenancy_id, tenancy_status, start_date, end_date, monthly_rent, security_deposit, currency, unit_id, unit_number, property_id, property_name, address_line_1, city, landlord_name, landlord_business_name, landlord_email, landlord_phone",
    )
    .order("start_date", { ascending: false });
  const rows = (data ?? []) as unknown as Omit<MyTenancy, "floor_number" | "unit_type">[];
  if (rows.length === 0) return [];

  const { data: units } = await supabase.from("units").select("id, floor_number, unit_type").in("id", rows.map((r) => r.unit_id));
  const byUnit = new Map((units ?? []).map((u) => [u.id as string, u]));
  const rank = (s: string) => (s === "active" ? 0 : s === "pending" ? 1 : 2);
  return rows
    .map((r) => ({
      ...r,
      monthly_rent: Number(r.monthly_rent),
      security_deposit: Number(r.security_deposit),
      floor_number: (byUnit.get(r.unit_id)?.floor_number as number | null | undefined) ?? null,
      unit_type: (byUnit.get(r.unit_id)?.unit_type as string | null | undefined) ?? null,
    }))
    .sort((a, b) => rank(a.tenancy_status) - rank(b.tenancy_status));
}

// --- offers (landlord-initiated, waiting for the tenant to accept or decline) ----------------------------------------------

export type LeaseOffer = {
  request_id: string;
  expires_at: string;
  unit_number: string;
  floor_number: number | null;
  monthly_rent: number;
  security_deposit: number;
  currency: string;
  property_name: string;
  address_line_1: string | null;
  city: string | null;
  landlord_name: string | null;
  landlord_phone: string | null;
};

export async function getLeaseOffers(): Promise<LeaseOffer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_link_request_overview")
    .select("request_id, expires_at, unit_number, floor_number, monthly_rent, security_deposit, currency, property_name, address_line_1, city, landlord_name, landlord_phone")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as LeaseOffer[]).map((o) => ({ ...o, monthly_rent: Number(o.monthly_rent), security_deposit: Number(o.security_deposit) }));
}

// --- contacts and payment info -------------------------------------------------------------------------------------------------

export type PropertyContact = { contact_role: "owner" | "property_manager" | "caretaker"; display_name: string | null; phone: string | null; email: string | null };

export async function getPropertyContacts(propertyId: string): Promise<PropertyContact[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_property_contacts").select("contact_role, display_name, phone, email").eq("property_id", propertyId);
  const rank = { owner: 0, property_manager: 1, caretaker: 2 } as const;
  return ((data ?? []) as PropertyContact[]).sort((a, b) => rank[a.contact_role] - rank[b.contact_role]);
}

export type PaymentInfo = { mpesa_paybill: string | null; payment_instructions: string | null };

export async function getPaymentInfo(propertyId: string): Promise<PaymentInfo | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenant_payment_info").select("mpesa_paybill, payment_instructions").eq("property_id", propertyId).maybeSingle();
  return (data as PaymentInfo | null) ?? null;
}

// --- statements ----------------------------------------------------------------------------------------------------------------------

export type Statement = {
  invoice_id: string;
  billing_period_start: string;
  due_date: string;
  currency: string;
  base_rent: number;
  water_bill: number;
  garbage_fee: number;
  late_penalty: number;
  previous_balance: number;
  total_amount: number;
  status: StatementStatus;
  unit_number: string;
};

type RawStatement = Omit<Statement, "status"> & { status: "unpaid" | "partial" | "paid" | "cancelled" };

/** Itemised statements for a tenancy, newest first, with overdue worked out from the due date. */
export async function getStatements(tenancyId: string, limit = 12): Promise<Statement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_overview")
    .select("invoice_id, billing_period_start, due_date, currency, base_rent, water_bill, garbage_fee, late_penalty, previous_balance, total_amount, status, unit_number")
    .eq("tenancy_id", tenancyId)
    .order("billing_period_start", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawStatement[]).map((r) => ({
    ...r,
    base_rent: Number(r.base_rent),
    water_bill: Number(r.water_bill),
    garbage_fee: Number(r.garbage_fee),
    late_penalty: Number(r.late_penalty),
    previous_balance: Number(r.previous_balance),
    total_amount: Number(r.total_amount),
    status: statementStatus(r.status, r.due_date),
  }));
}

export type WaterDetail = { units_consumed: number; rate_per_unit: number; previous_reading: number; current_reading: number };

/** The meter reading behind an invoice's water charge (the tenant may read readings for their own unit). */
export async function getWaterDetail(tenancyId: string, period: string): Promise<WaterDetail | null> {
  const supabase = await createClient();
  const { data: tenancy } = await supabase.from("tenant_tenancy_overview").select("unit_id").eq("tenancy_id", tenancyId).maybeSingle();
  if (!tenancy) return null;
  const { data } = await supabase
    .from("utility_readings")
    .select("units_consumed, rate_per_unit, previous_reading, current_reading")
    .eq("unit_id", tenancy.unit_id)
    .eq("period_start", period)
    .maybeSingle();
  if (!data) return null;
  return {
    units_consumed: Number(data.units_consumed),
    rate_per_unit: Number(data.rate_per_unit),
    previous_reading: Number(data.previous_reading),
    current_reading: Number(data.current_reading),
  };
}

// --- dashboard counters --------------------------------------------------------------------------------------------------------------

export async function getOpenTicketCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]);
  return count ?? 0;
}
