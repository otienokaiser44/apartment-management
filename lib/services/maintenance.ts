import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus, TicketInput } from "@/lib/validation/portal";
import { failure, type Result } from "./errors";

export type TicketUpdate = {
  id: string;
  author_role: "tenant" | "landlord" | "manager" | "caretaker" | "admin";
  kind: "created" | "comment" | "status_change";
  from_status: MaintenanceStatus | null;
  to_status: MaintenanceStatus | null;
  message: string | null;
  created_at: string;
};

export type TicketRow = {
  id: string;
  title: string;
  description: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  unit_id: string;
  tenancy_id: string;
  tenant_id: string;
  unit_number: string;
  property_id: string;
  property_name: string;
  /** Most recent timeline entry that is not the ticket's creation. */
  latest: TicketUpdate | null;
};

const TICKET_COLUMNS =
  "id, title, description, category, priority, status, created_at, updated_at, resolved_at, unit_id, tenancy_id, tenant_id, units(unit_number, property_id, properties(name))";

type PropertyJoin = { name: string } | { name: string }[] | null;
type UnitJoin = { unit_number: string; property_id: string; properties: PropertyJoin };
type RawTicket = Omit<TicketRow, "unit_number" | "property_id" | "property_name" | "latest"> & { units: UnitJoin | UnitJoin[] | null };

const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function shape(raw: RawTicket, latest: TicketUpdate | null): TicketRow {
  const unit = first(raw.units);
  const prop = unit ? first(unit.properties) : null;
  const { units: _units, ...rest } = raw;
  void _units;
  return { ...rest, unit_number: unit?.unit_number ?? "?", property_id: unit?.property_id ?? "", property_name: prop?.name ?? "", latest };
}

/** Tickets the caller may see (RLS: a tenant's own, or those of the properties a staff member handles). */
export async function listTickets(opts: { statuses?: MaintenanceStatus[]; limit?: number } = {}): Promise<TicketRow[]> {
  const supabase = await createClient();
  let q = supabase.from("maintenance_requests").select(TICKET_COLUMNS).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  const { data } = await q;
  const rows = (data ?? []) as unknown as RawTicket[];
  if (rows.length === 0) return [];

  const { data: updates } = await supabase
    .from("maintenance_updates")
    .select("id, request_id, author_role, kind, from_status, to_status, message, created_at")
    .in("request_id", rows.map((r) => r.id))
    .neq("kind", "created")
    .order("created_at", { ascending: false });
  const latestBy = new Map<string, TicketUpdate>();
  for (const u of (updates ?? []) as (TicketUpdate & { request_id: string })[]) {
    if (!latestBy.has(u.request_id)) latestBy.set(u.request_id, u);
  }
  return rows.map((r) => shape(r, latestBy.get(r.id) ?? null));
}

export type TicketAttachment = { id: string; name: string; isImage: boolean; url: string | null };

export async function getTicket(id: string): Promise<{ ticket: TicketRow; updates: TicketUpdate[]; attachments: TicketAttachment[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("maintenance_requests").select(TICKET_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;

  const [{ data: updates }, { data: files }] = await Promise.all([
    supabase
      .from("maintenance_updates")
      .select("id, author_role, kind, from_status, to_status, message, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("maintenance_attachments").select("id, storage_path").eq("maintenance_request_id", id).order("created_at"),
  ]);

  const paths = (files ?? []).map((f) => f.storage_path as string);
  const signed = paths.length ? await supabase.storage.from("maintenance-attachments").createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map<string, string | null>();
  for (const s of signed.data ?? []) urlByPath.set(s.path ?? "", s.signedUrl ?? null);

  const attachments = (files ?? []).map((f, i): TicketAttachment => {
    const path = f.storage_path as string;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return { id: f.id as string, name: `Attachment ${i + 1}.${ext}`, isImage: ["png", "jpg", "jpeg", "webp"].includes(ext), url: urlByPath.get(path) ?? null };
  });
  return { ticket: shape(data as unknown as RawTicket, null), updates: (updates ?? []) as TicketUpdate[], attachments };
}

/** Names/phones of the tenants behind tickets, for owners and managers (landlord_tenancy_overview is scoped to them). */
export async function getTicketTenants(tenancyIds: string[]): Promise<Map<string, { name: string | null; phone: string | null }>> {
  const out = new Map<string, { name: string | null; phone: string | null }>();
  if (tenancyIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("landlord_tenancy_overview").select("tenancy_id, tenant_name, tenant_phone").in("tenancy_id", tenancyIds);
  for (const r of (data ?? []) as { tenancy_id: string; tenant_name: string | null; tenant_phone: string | null }[]) {
    out.set(r.tenancy_id, { name: r.tenant_name, phone: r.tenant_phone });
  }
  return out;
}

export async function submitTicket(v: TicketInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_maintenance_ticket", {
    p_tenancy_id: v.tenancyId,
    p_title: v.title,
    p_category: v.category,
    p_priority: v.priority,
    p_description: v.description ?? null,
  });
  if (error) return failure(error, "We could not submit your ticket. Please try again.");
  return { ok: true, data: { id: data as string } };
}

export async function updateTicket(id: string, status: string | undefined, message: string | undefined): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_maintenance_ticket", { p_request_id: id, p_status: status ?? null, p_message: message ?? null });
  return error ? failure(error, "Could not update the ticket.") : { ok: true, data: undefined };
}

export async function commentOnTicket(id: string, message: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("comment_on_maintenance_ticket", { p_request_id: id, p_message: message });
  return error ? failure(error, "Could not post your message.") : { ok: true, data: undefined };
}

export async function cancelTicket(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_maintenance_ticket", { p_request_id: id });
  return error ? failure(error, "Could not cancel the ticket.") : { ok: true, data: undefined };
}
