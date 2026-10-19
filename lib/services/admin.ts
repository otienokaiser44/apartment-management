import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReviewInput } from "@/lib/validation/verification";
import { failure, type Result } from "./errors";

const SIGNED_URL_SECONDS = 300;
const head = { count: "exact" as const, head: true };

// --- dashboard -------------------------------------------------------------------------------------------------------------------

export type DashboardStats = {
  landlords: number;
  tenants: number;
  properties: number;
  units: number;
  awaitingReview: number;
  openReports: number;
  verification: Record<"pending" | "under_review" | "verified" | "rejected" | "suspended", number>;
};

const VERIFICATION_STATES = ["pending", "under_review", "verified", "rejected", "suspended"] as const;

/** Counts only (head requests), so no rows are transferred. The admin RLS policies make these platform-wide. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const [landlords, tenants, properties, units, awaiting, reports, ...byState] = await Promise.all([
    supabase.from("profiles").select("id", head).eq("role", "landlord"),
    supabase.from("profiles").select("id", head).eq("role", "tenant"),
    supabase.from("properties").select("id", head),
    supabase.from("units").select("id", head),
    supabase.from("property_verification_requests").select("id", head).in("status", ["submitted", "under_review"]),
    supabase.from("property_reports").select("id", head).in("status", ["open", "under_review"]),
    ...VERIFICATION_STATES.map((s) => supabase.from("properties").select("id", head).eq("verification_status", s)),
  ]);
  return {
    landlords: landlords.count ?? 0,
    tenants: tenants.count ?? 0,
    properties: properties.count ?? 0,
    units: units.count ?? 0,
    awaitingReview: awaiting.count ?? 0,
    openReports: reports.count ?? 0,
    verification: Object.fromEntries(VERIFICATION_STATES.map((s, i) => [s, byState[i].count ?? 0])) as DashboardStats["verification"],
  };
}

export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_name: string | null;
};

export async function listRecentActivity(limit = 8): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as { id: string; action: string; entity_type: string; actor_user_id: string | null; created_at: string }[];
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => !!v))];
  const names = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null; email: string | null }[]) names.set(p.id, p.full_name || p.email);
  }
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity_type: r.entity_type,
    created_at: r.created_at,
    actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
  }));
}

// --- verification queue ----------------------------------------------------------------------------------------------------------

export type QueueRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  property_id: string;
  property_name: string;
  city: string | null;
  landlord_name: string | null;
  document_count: number;
};

type Joined<T> = T | T[] | null;
const first = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

async function landlordNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!userIds.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
  for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) out.set(p.id, p.full_name || p.email);
  return out;
}

/** Requests that need an admin, oldest first so nothing waits forever. */
export async function listVerificationQueue(limit?: number): Promise<QueueRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("property_verification_requests")
    .select(
      "id, status, submitted_at, property_id, properties(name, city), landlord_profiles(user_id, business_name), property_verification_documents(count)",
    )
    .in("status", ["submitted", "under_review"])
    .order("submitted_at", { ascending: true });
  if (limit) q = q.limit(limit);
  const { data } = await q;
  type Row = {
    id: string;
    status: string;
    submitted_at: string | null;
    property_id: string;
    properties: Joined<{ name: string; city: string | null }>;
    landlord_profiles: Joined<{ user_id: string; business_name: string | null }>;
    property_verification_documents: { count: number }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const names = await landlordNames(rows.map((r) => first(r.landlord_profiles)?.user_id).filter((v): v is string => !!v));
  return rows.map((r) => {
    const landlord = first(r.landlord_profiles);
    const property = first(r.properties);
    return {
      id: r.id,
      status: r.status,
      submitted_at: r.submitted_at,
      property_id: r.property_id,
      property_name: property?.name ?? "Unknown property",
      city: property?.city ?? null,
      landlord_name: landlord?.business_name || (landlord ? names.get(landlord.user_id) : null) || null,
      document_count: r.property_verification_documents?.[0]?.count ?? 0,
    };
  });
}

export type VerificationDocument = {
  id: string;
  document_type: string;
  label: string;
  status: string;
  rejection_reason: string | null;
  /** Short-lived signed link. Created on every page load, never stored. */
  url: string | null;
  created_at: string;
};

export type VerificationDetail = {
  id: string;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  property: { id: string; name: string; property_code: string; city: string | null; address: string; status: string; verification_status: string };
  landlord: { name: string | null; email: string | null; phone: string | null; business_name: string | null };
  documents: VerificationDocument[];
  missingRequired: string[];
};

export async function getVerificationDetail(requestId: string): Promise<VerificationDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_verification_requests")
    .select(
      "id, status, submitted_at, reviewed_at, rejection_reason, admin_notes, " +
        "properties(id, name, property_code, city, address_line_1, status, verification_status), landlord_profiles(user_id, business_name)",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    status: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    admin_notes: string | null;
    properties: Joined<{ id: string; name: string; property_code: string; city: string | null; address_line_1: string; status: string; verification_status: string }>;
    landlord_profiles: Joined<{ user_id: string; business_name: string | null }>;
  };
  const property = first(row.properties);
  const landlordRow = first(row.landlord_profiles);
  if (!property) return null;

  const [docsRes, typesRes, personRes] = await Promise.all([
    supabase
      .from("property_verification_documents")
      .select("id, document_type, status, rejection_reason, storage_path, created_at")
      .eq("verification_request_id", requestId)
      .order("created_at"),
    supabase.from("verification_document_types").select("code, label, is_required"),
    landlordRow ? supabase.from("profiles").select("full_name, email, phone").eq("id", landlordRow.user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const docs = (docsRes.data ?? []) as { id: string; document_type: string; status: string; rejection_reason: string | null; storage_path: string; created_at: string }[];
  const types = (typesRes.data ?? []) as { code: string; label: string; is_required: boolean }[];
  const labelOf = new Map(types.map((t) => [t.code, t.label]));

  const paths = docs.map((d) => d.storage_path);
  const signed = paths.length ? await supabase.storage.from("verification-documents").createSignedUrls(paths, SIGNED_URL_SECONDS) : { data: [] };
  const urlByPath = new Map<string, string>();
  for (const s of (signed.data ?? []) as { path: string | null; signedUrl: string }[]) if (s.path) urlByPath.set(s.path, s.signedUrl);

  const have = new Set(docs.map((d) => d.document_type));
  const person = personRes.data as { full_name: string | null; email: string | null; phone: string | null } | null;
  return {
    id: row.id,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    admin_notes: row.admin_notes,
    property: {
      id: property.id,
      name: property.name,
      property_code: property.property_code,
      city: property.city,
      address: property.address_line_1,
      status: property.status,
      verification_status: property.verification_status,
    },
    landlord: {
      name: person?.full_name ?? null,
      email: person?.email ?? null,
      phone: person?.phone ?? null,
      business_name: landlordRow?.business_name ?? null,
    },
    documents: docs.map((d) => ({
      id: d.id,
      document_type: d.document_type,
      label: labelOf.get(d.document_type) ?? d.document_type,
      status: d.status,
      rejection_reason: d.rejection_reason,
      url: urlByPath.get(d.storage_path) ?? null,
      created_at: d.created_at,
    })),
    missingRequired: types.filter((t) => t.is_required && !have.has(t.code)).map((t) => t.label),
  };
}

/** The only way a verification decision is made. The RPC re-checks is_admin() and writes the audit entry. */
export async function reviewVerification(v: ReviewInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_property_verification", {
    p_request_id: v.requestId,
    p_decision: v.decision,
    p_reason: v.reason || null,
  });
  return error ? failure(error, "Could not save the decision.") : { ok: true, data: undefined };
}
