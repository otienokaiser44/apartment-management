import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VacateInput, VacateStatus } from "@/lib/validation/portal";
import { failure, type Result } from "./errors";

export type VacateNoticeRow = {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  notice_date: string;
  intended_move_out_date: string;
  reason: string;
  refund_account_details: string | null;
  status: VacateStatus;
  deposit_held: number;
  acknowledged_at: string | null;
  inspection_at: string | null;
  refund_amount: number | null;
  deductions: number | null;
  landlord_notes: string | null;
  refunded_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, tenancy_id, tenant_id, notice_date, intended_move_out_date, reason, refund_account_details, status, deposit_held, acknowledged_at, inspection_at, refund_amount, deductions, landlord_notes, refunded_at, created_at";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const normalise = (r: VacateNoticeRow): VacateNoticeRow => ({
  ...r,
  deposit_held: Number(r.deposit_held),
  refund_amount: num(r.refund_amount),
  deductions: num(r.deductions),
});

/** The signed-in tenant's own notices, newest first. */
export async function listMyVacateNotices(): Promise<VacateNoticeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("vacate_notices").select(COLUMNS).order("created_at", { ascending: false });
  return ((data ?? []) as unknown as VacateNoticeRow[]).map(normalise);
}

export async function submitVacateNotice(v: VacateInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_vacate_notice", {
    p_tenancy_id: v.tenancyId,
    p_move_out_date: v.moveOutDate,
    p_reason: v.reason,
    p_refund_details: v.refundDetails ?? null,
  });
  if (error) return failure(error, "We could not submit your notice. Please try again.");
  return { ok: true, data: { id: data as string } };
}

export async function withdrawVacateNotice(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_vacate_notice", { p_notice_id: id });
  return error ? failure(error, "Could not withdraw the notice.") : { ok: true, data: undefined };
}

export type StaffVacateRow = VacateNoticeRow & {
  unit_number: string;
  property_name: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  currency: string;
  tenancy_status: string;
};

/** Notices for the properties the caller owns or manages (RLS), joined with who and where. */
export async function listVacateNoticesForStaff(): Promise<StaffVacateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("vacate_notices").select(COLUMNS).order("created_at", { ascending: false });
  const notices = ((data ?? []) as unknown as VacateNoticeRow[]).map(normalise);
  if (notices.length === 0) return [];
  const { data: tenancies } = await supabase
    .from("landlord_tenancy_overview")
    .select("tenancy_id, tenancy_status, unit_number, property_name, tenant_name, tenant_phone, currency")
    .in("tenancy_id", notices.map((n) => n.tenancy_id));
  const by = new Map((tenancies ?? []).map((t) => [t.tenancy_id as string, t]));
  return notices.map((n) => {
    const t = by.get(n.tenancy_id);
    return {
      ...n,
      unit_number: (t?.unit_number as string | undefined) ?? "?",
      property_name: (t?.property_name as string | undefined) ?? "",
      tenant_name: (t?.tenant_name as string | null | undefined) ?? null,
      tenant_phone: (t?.tenant_phone as string | null | undefined) ?? null,
      currency: (t?.currency as string | undefined) ?? "KES",
      tenancy_status: (t?.tenancy_status as string | undefined) ?? "",
    };
  });
}

export type AdvanceExtras = { inspectionAt?: string; refundAmount?: number; deductions?: number; note?: string };

export async function advanceVacateNotice(
  id: string,
  action: "acknowledge" | "schedule_inspection" | "record_refund",
  extras: AdvanceExtras = {},
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_vacate_notice", {
    p_notice_id: id,
    p_action: action,
    p_inspection_at: extras.inspectionAt ?? null,
    p_refund_amount: extras.refundAmount ?? null,
    p_deductions: extras.deductions ?? null,
    p_note: extras.note ?? null,
  });
  return error ? failure(error, "Could not update the notice.") : { ok: true, data: undefined };
}
