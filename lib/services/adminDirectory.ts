import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Platform-wide read access for admins (every query relies on the admin RLS policies; nothing here writes). */

const LIMIT = 200;
const head = { count: "exact" as const, head: true };

type Joined<T> = T | T[] | null;
const first = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Search text goes into a PostgREST `or()` filter, so drop everything that could change the filter's shape. */
export function cleanSearch(raw: string | undefined): string {
  return (raw ?? "").replace(/[^\p{L}\p{N}@.\- +]/gu, "").trim().slice(0, 60);
}

async function displayNames(userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!userIds.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
  for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) out.set(p.id, p.full_name || p.email);
  return out;
}

// --- properties ------------------------------------------------------------------------------------------------------------------

export const PROPERTY_VERIFICATION_FILTERS = ["unverified", "pending", "under_review", "verified", "rejected", "suspended"] as const;
export type PropertyVerificationFilter = (typeof PROPERTY_VERIFICATION_FILTERS)[number];

export type PropertyRow = {
  id: string;
  name: string;
  property_code: string | null;
  city: string | null;
  status: string;
  verification_status: string;
  created_at: string;
  landlord_name: string | null;
  units: number;
  occupied: number;
};

export type PropertyList = { rows: PropertyRow[]; total: number; truncated: boolean };

export async function listProperties(opts: { q?: string; verification?: string }): Promise<PropertyList> {
  const supabase = await createClient();
  const q = cleanSearch(opts.q);
  let query = supabase
    .from("properties")
    .select("id, name, property_code, city, status, verification_status, created_at, landlord_profiles(user_id, business_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.or(`name.ilike.%${q}%,city.ilike.%${q}%,property_code.ilike.%${q}%`);
  if (opts.verification && (PROPERTY_VERIFICATION_FILTERS as readonly string[]).includes(opts.verification)) {
    query = query.eq("verification_status", opts.verification as PropertyVerificationFilter);
  }
  const { data, count } = await query;

  type Row = {
    id: string;
    name: string;
    property_code: string | null;
    city: string | null;
    status: string;
    verification_status: string;
    created_at: string;
    landlord_profiles: Joined<{ user_id: string; business_name: string | null }>;
  };
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);

  const [names, unitsRes] = await Promise.all([
    displayNames(rows.map((r) => first(r.landlord_profiles)?.user_id).filter((v): v is string => !!v)),
    ids.length ? supabase.from("units").select("property_id, status").in("property_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const total = new Map<string, number>();
  const occupied = new Map<string, number>();
  for (const u of (unitsRes.data ?? []) as { property_id: string; status: string }[]) {
    total.set(u.property_id, (total.get(u.property_id) ?? 0) + 1);
    if (u.status === "occupied") occupied.set(u.property_id, (occupied.get(u.property_id) ?? 0) + 1);
  }

  return {
    total: count ?? rows.length,
    truncated: (count ?? 0) > rows.length,
    rows: rows.map((r) => {
      const landlord = first(r.landlord_profiles);
      return {
        id: r.id,
        name: r.name,
        property_code: r.property_code,
        city: r.city,
        status: r.status,
        verification_status: r.verification_status,
        created_at: r.created_at,
        landlord_name: landlord?.business_name || (landlord ? names.get(landlord.user_id) : null) || null,
        units: total.get(r.id) ?? 0,
        occupied: occupied.get(r.id) ?? 0,
      };
    }),
  };
}

// --- people ----------------------------------------------------------------------------------------------------------------------

export const PEOPLE_ROLES = ["landlord", "tenant", "manager"] as const;
export type PeopleRole = (typeof PEOPLE_ROLES)[number];

export type PersonRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  /** Landlord: business name. Tenant: current residence. */
  detail: string | null;
  /** Landlord: properties owned. Tenant: not used. */
  properties: number | null;
};

export type PeopleList = { rows: PersonRow[]; total: number; truncated: boolean; counts: Record<PeopleRole, number> };

export async function listPeople(role: PeopleRole, rawQuery?: string): Promise<PeopleList> {
  const supabase = await createClient();
  const q = cleanSearch(rawQuery);

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, status, created_at", { count: "exact" })
    .eq("role", role)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

  const [{ data, count }, ...roleCounts] = await Promise.all([
    query,
    ...PEOPLE_ROLES.map((r) => supabase.from("profiles").select("id", head).eq("role", r)),
  ]);
  const people = (data ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null; status: string; created_at: string }[];
  const userIds = people.map((p) => p.id);

  const detail = new Map<string, string>();
  const propertyCount = new Map<string, number>();

  if (role === "landlord" && userIds.length) {
    const { data: landlords } = await supabase.from("landlord_profiles").select("id, user_id, business_name").in("user_id", userIds);
    const ls = (landlords ?? []) as { id: string; user_id: string; business_name: string | null }[];
    const byLandlord = new Map(ls.map((l) => [l.id, l.user_id]));
    for (const l of ls) if (l.business_name) detail.set(l.user_id, l.business_name);
    if (ls.length) {
      const { data: props } = await supabase.from("properties").select("landlord_id").in("landlord_id", ls.map((l) => l.id));
      for (const p of (props ?? []) as { landlord_id: string }[]) {
        const uid = byLandlord.get(p.landlord_id);
        if (uid) propertyCount.set(uid, (propertyCount.get(uid) ?? 0) + 1);
      }
    }
  }

  if (role === "tenant" && userIds.length) {
    const { data: tps } = await supabase.from("tenant_profiles").select("id, user_id").in("user_id", userIds);
    const tenantProfiles = (tps ?? []) as { id: string; user_id: string }[];
    const userOf = new Map(tenantProfiles.map((t) => [t.id, t.user_id]));
    if (tenantProfiles.length) {
      const { data: tenancies } = await supabase
        .from("tenancies")
        .select("tenant_id, status, units(unit_number, properties(name))")
        .in("tenant_id", tenantProfiles.map((t) => t.id))
        .in("status", ["active", "pending"]);
      type T = { tenant_id: string; status: string; units: Joined<{ unit_number: string; properties: Joined<{ name: string }> }> };
      // Prefer the active tenancy over a pending one.
      for (const t of ((tenancies ?? []) as unknown as T[]).sort((a, b) => (a.status === "active" ? 1 : 0) - (b.status === "active" ? 1 : 0))) {
        const uid = userOf.get(t.tenant_id);
        const unit = first(t.units);
        if (!uid || !unit) continue;
        const where = `Unit ${unit.unit_number} · ${first(unit.properties)?.name ?? "property"}`;
        detail.set(uid, t.status === "active" ? where : `${where} (move-in pending)`);
      }
    }
  }

  return {
    total: count ?? people.length,
    truncated: (count ?? 0) > people.length,
    counts: Object.fromEntries(PEOPLE_ROLES.map((r, i) => [r, roleCounts[i].count ?? 0])) as Record<PeopleRole, number>,
    rows: people.map((p) => ({
      id: p.id,
      name: p.full_name,
      email: p.email,
      phone: p.phone,
      status: p.status,
      created_at: p.created_at,
      detail: detail.get(p.id) ?? null,
      properties: role === "landlord" ? (propertyCount.get(p.id) ?? 0) : null,
    })),
  };
}
