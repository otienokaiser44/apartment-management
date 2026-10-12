import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TenantRow = {
  tenancy_id: string;
  tenant_name: string | null;
  tenant_email: string | null;
  tenant_phone: string | null;
  unit_number: string;
  property_id: string;
  property_name: string;
  start_date: string;
  monthly_rent: number;
  currency: string;
};

/** Active tenants across all of the landlord's properties (the view is scoped to the signed-in landlord). */
export async function listAllActiveTenants(): Promise<TenantRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("landlord_tenancy_overview")
    .select("tenancy_id, tenant_name, tenant_email, tenant_phone, unit_number, property_id, property_name, start_date, monthly_rent, currency")
    .eq("tenancy_status", "active")
    .order("property_name")
    .order("unit_number");
  return (data ?? []) as TenantRow[];
}

/** Pending items per property that need the landlord: tenant requests and outstanding link requests. */
export async function pendingByProperty(): Promise<Map<string, { requests: number; links: number }>> {
  const supabase = await createClient();
  const [apps, links] = await Promise.all([
    supabase.from("landlord_application_overview").select("property_id").eq("application_status", "pending"),
    supabase.from("tenant_link_requests").select("units(property_id)").eq("status", "pending").gt("expires_at", new Date().toISOString()),
  ]);
  const out = new Map<string, { requests: number; links: number }>();
  const bump = (id: string | undefined, key: "requests" | "links") => {
    if (!id) return;
    const cur = out.get(id) ?? { requests: 0, links: 0 };
    cur[key] += 1;
    out.set(id, cur);
  };
  for (const a of (apps.data ?? []) as { property_id: string }[]) bump(a.property_id, "requests");
  for (const l of (links.data ?? []) as unknown as { units: { property_id: string } | { property_id: string }[] | null }[]) {
    const u = Array.isArray(l.units) ? l.units[0] : l.units;
    bump(u?.property_id, "links");
  }
  return out;
}

export type OpenInvoiceTotals = { count: number; amount: number; currency: string };

/** Unpaid and partially paid invoices per property. Empty until billing (migration 031) is applied. */
export async function openInvoicesByProperty(): Promise<Map<string, OpenInvoiceTotals>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_overview")
    .select("property_id, total_amount, currency, status")
    .in("status", ["unpaid", "partial"]);
  const out = new Map<string, OpenInvoiceTotals>();
  for (const r of (data ?? []) as { property_id: string; total_amount: number; currency: string }[]) {
    const cur = out.get(r.property_id) ?? { count: 0, amount: 0, currency: r.currency };
    cur.count += 1;
    cur.amount += Number(r.total_amount);
    out.set(r.property_id, cur);
  }
  return out;
}
