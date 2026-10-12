import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AnnouncementInput, BillingSettingsInput, ReadingInput, ReadingRowError } from "@/lib/validation/billing";
import type { NoticeCategory } from "@/lib/validation/portal";
import { failure, rowErrorsFrom, type Result } from "./errors";

export type BillingSettings = {
  default_garbage_fee: number;
  water_rate_per_unit: number;
  late_penalty_percentage: number;
  rent_due_day: number;
  mpesa_paybill: string | null;
  payment_instructions: string | null;
};

export async function getBillingSettings(propertyId: string): Promise<BillingSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_settings")
    .select("default_garbage_fee, water_rate_per_unit, late_penalty_percentage, rent_due_day, mpesa_paybill, payment_instructions")
    .eq("property_id", propertyId)
    .maybeSingle();
  return (data as BillingSettings | null) ?? null;
}

export async function updateBillingSettings(propertyId: string, v: BillingSettingsInput): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_settings")
    .update({
      default_garbage_fee: v.defaultGarbageFee,
      water_rate_per_unit: v.waterRatePerUnit,
      late_penalty_percentage: v.latePenaltyPercentage,
      rent_due_day: v.rentDueDay,
      mpesa_paybill: v.mpesaPaybill ?? null,
      payment_instructions: v.paymentInstructions ?? null,
    })
    .eq("property_id", propertyId)
    .select("property_id");
  if (error) return failure(error, "Could not save the billing settings.");
  return data?.length ? { ok: true, data: undefined } : { ok: false, message: "Property not found." };
}

export type MeterRow = {
  unit_id: string;
  unit_number: string;
  tenant_name: string | null;
  /** Latest reading BEFORE this month (null = no baseline yet, so the first reading becomes the baseline). */
  previous_reading: number | null;
  /** Reading already saved for this month, if any. */
  recorded: { current_reading: number; units_consumed: number; water_amount: number } | null;
  invoiced: boolean;
};

type ReadingDb = { unit_id: string; period_start: string; current_reading: number; units_consumed: number; water_amount: number };

/** Everything the meter grid needs for one month: occupied units, their baselines and any saved readings. */
export async function getMeterRows(propertyId: string, period: string): Promise<MeterRow[]> {
  const supabase = await createClient();
  const { data: tenancies } = await supabase
    .from("landlord_tenancy_overview")
    .select("tenancy_id, unit_id, unit_number, tenant_name")
    .eq("property_id", propertyId)
    .eq("tenancy_status", "active")
    .order("unit_number");
  const rows = (tenancies ?? []) as { tenancy_id: string; unit_id: string; unit_number: string; tenant_name: string | null }[];
  if (rows.length === 0) return [];
  const unitIds = rows.map((r) => r.unit_id);

  const [{ data: readings }, { data: invoices }] = await Promise.all([
    supabase
      .from("utility_readings")
      .select("unit_id, period_start, current_reading, units_consumed, water_amount")
      .in("unit_id", unitIds)
      .order("period_start", { ascending: false }),
    supabase.from("invoice_overview").select("unit_id").eq("property_id", propertyId).eq("billing_period_start", period),
  ]);
  const all = (readings ?? []) as ReadingDb[];
  const invoiced = new Set(((invoices ?? []) as { unit_id: string }[]).map((i) => i.unit_id));

  return rows.map((r) => {
    const mine = all.filter((x) => x.unit_id === r.unit_id);
    const thisMonth = mine.find((x) => x.period_start === period);
    const before = mine.find((x) => x.period_start < period);
    return {
      unit_id: r.unit_id,
      unit_number: r.unit_number,
      tenant_name: r.tenant_name,
      previous_reading: before ? Number(before.current_reading) : null,
      recorded: thisMonth
        ? {
            current_reading: Number(thisMonth.current_reading),
            units_consumed: Number(thisMonth.units_consumed),
            water_amount: Number(thisMonth.water_amount),
          }
        : null,
      invoiced: invoiced.has(r.unit_id),
    };
  });
}

/** All-or-nothing: one RPC call saves every reading or none; every bad row is reported together. */
export async function recordReadings(
  propertyId: string,
  period: string,
  readings: ReadingInput[],
): Promise<{ ok: true; data: { count: number } } | { ok: false; message: string; rowErrors?: ReadingRowError[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_utility_readings", {
    p_property_id: propertyId,
    p_period: period,
    p_readings: readings,
  });
  if (error) {
    return { ...failure(error, "Could not save the readings. Nothing was saved."), rowErrors: rowErrorsFrom<ReadingRowError>(error) };
  }
  return { ok: true, data: { count: data as number } };
}

export type GeneratedInvoice = {
  tenancy_id: string;
  unit_number: string;
  invoice_id: string | null;
  total_amount: number | null;
  skipped_reason: string | null;
};

export async function generateInvoices(propertyId: string, period: string, requireReadings: boolean): Promise<Result<GeneratedInvoice[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_monthly_invoices", {
    p_property_id: propertyId,
    p_period: period,
    p_require_readings: requireReadings,
  });
  if (error) return failure(error, "Could not generate the invoices.");
  return { ok: true, data: (data ?? []) as GeneratedInvoice[] };
}

export type InvoiceRow = {
  invoice_id: string;
  unit_id: string;
  unit_number: string;
  billing_period_start: string;
  due_date: string;
  currency: string;
  base_rent: number;
  water_bill: number;
  garbage_fee: number;
  late_penalty: number;
  previous_balance: number;
  total_amount: number;
  status: "unpaid" | "partial" | "paid" | "cancelled";
};

export async function listInvoices(propertyId: string, opts: { period?: string; unitId?: string } = {}): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("invoice_overview")
    .select(
      "invoice_id, unit_id, unit_number, billing_period_start, due_date, currency, base_rent, water_bill, garbage_fee, late_penalty, previous_balance, total_amount, status",
    )
    .eq("property_id", propertyId)
    .order("billing_period_start", { ascending: false })
    .order("unit_number");
  if (opts.period) q = q.eq("billing_period_start", opts.period);
  if (opts.unitId) q = q.eq("unit_id", opts.unitId);
  const { data } = await q.limit(500);
  return (data ?? []) as InvoiceRow[];
}

// --- announcements -----------------------------------------------------------------------------------------

export async function sendAnnouncement(propertyId: string, v: AnnouncementInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_announcement", {
    p_property_id: propertyId,
    p_title: v.title,
    p_message: v.message,
    p_audience: v.audience,
    p_value: v.value ?? null,
    p_expires_at: null,
    p_category: v.category,
  });
  if (error) return failure(error, "Could not send the announcement.");
  return { ok: true, data: { id: data as string } };
}

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  target_audience: string;
  target_value: string | null;
  category: NoticeCategory;
  created_at: string;
  recipients: number;
};

/** Announcements sent for a property (the creator policy scopes them), newest first, with recipient counts. */
export async function listSentAnnouncements(propertyId: string): Promise<AnnouncementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notices")
    .select("id, title, body, target_audience, target_value, category, created_at, notice_recipients(count)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(50);
  type Row = Omit<AnnouncementRow, "recipients"> & { notice_recipients: { count: number }[] };
  return ((data ?? []) as unknown as Row[]).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    target_audience: n.target_audience,
    target_value: n.target_value,
    category: n.category,
    created_at: n.created_at,
    recipients: n.notice_recipients?.[0]?.count ?? 0,
  }));
}

export type TenantAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  created_at: string;
  read: boolean;
};

/** Notices addressed to the signed-in tenant (RLS limits recipients to the tenant and notices to recipients). */
export async function listMyAnnouncements(limit = 20): Promise<TenantAnnouncement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notice_recipients")
    .select("read_at, notices(id, title, body, category, created_at)")
    .limit(100);
  type N = { id: string; title: string; body: string; category: NoticeCategory; created_at: string };
  const rows = (data ?? []) as unknown as { read_at: string | null; notices: N | N[] | null }[];
  const out: TenantAnnouncement[] = [];
  for (const r of rows) {
    const n = Array.isArray(r.notices) ? r.notices[0] : r.notices;
    if (n) out.push({ ...n, read: r.read_at !== null });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

/** Marks one notice as read for the signed-in tenant (the guard trigger only lets read_at change). */
export async function markNoticeRead(noticeId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("notice_recipients").update({ read_at: new Date().toISOString() }).eq("notice_id", noticeId).is("read_at", null);
  return error ? failure(error, "Could not mark the notice as read.") : { ok: true, data: undefined };
}
