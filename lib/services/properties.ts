import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PropertyInput, UnitInput } from "@/lib/validation/properties";
import type { Amenity, Property, PropertySummary, Unit } from "@/types/database";

export type ServiceResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Postgres/RLS errors are mapped to safe messages; raw details are not shown to the user. */
function friendly(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "23505") return "That already exists (duplicate unit number?).";
  if (error.code === "42501") return "You are not allowed to do that.";
  return fallback;
}

/** The caller's landlord profile id, derived from the session. Never taken from the client. */
async function myLandlordProfileId() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("landlord_profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
  return data?.id ?? null;
}

export async function listMyProperties(): Promise<PropertySummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("id, name, city, status, verification_status, units(id, status)")
    .order("created_at", { ascending: false });
  return (data ?? []) as PropertySummary[];
}

export async function getMyProperty(id: string): Promise<Property | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  return (data as Property | null) ?? null;
}

export async function listAmenities(): Promise<Amenity[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("amenities").select("id, name, slug").order("name");
  return data ?? [];
}

export async function getPropertyAmenityIds(propertyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("property_amenities").select("amenity_id").eq("property_id", propertyId);
  return (data ?? []).map((r) => r.amenity_id);
}

const propertyRow = (v: PropertyInput) => ({
  name: v.name,
  property_type: v.propertyType,
  description: v.description ?? null,
  address_line_1: v.addressLine1,
  address_line_2: v.addressLine2 ?? null,
  city: v.city,
  county_or_region: v.countyOrRegion ?? null,
  postal_code: v.postalCode ?? null,
  country: v.country,
});

async function syncAmenities(propertyId: string, amenityIds: string[]) {
  const supabase = await createClient();
  const del = await supabase.from("property_amenities").delete().eq("property_id", propertyId);
  if (del.error) return false;
  if (!amenityIds.length) return true;
  const ins = await supabase
    .from("property_amenities")
    .insert(amenityIds.map((amenity_id) => ({ property_id: propertyId, amenity_id })));
  return !ins.error;
}

/** New properties are always drafts and unverified (DB default + guard trigger); publishing/verification are separate flows. */
export async function createProperty(v: PropertyInput): Promise<ServiceResult<{ id: string }>> {
  const landlordId = await myLandlordProfileId();
  if (!landlordId) return fail("Your landlord profile could not be found.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({ ...propertyRow(v), landlord_id: landlordId })
    .select("id")
    .single();
  if (error || !data) return fail(error ? friendly(error, "Could not create the property.") : "Could not create the property.");
  // If amenities fail the property still exists; they can be re-saved from the edit page.
  await syncAmenities(data.id, v.amenityIds);
  return { ok: true, data: { id: data.id } };
}

export async function updateProperty(id: string, v: PropertyInput): Promise<ServiceResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("properties").update(propertyRow(v)).eq("id", id).select("id");
  if (error) return fail(friendly(error, "Could not save the property."));
  if (!data?.length) return fail("Property not found.");
  if (!(await syncAmenities(id, v.amenityIds))) return fail("Saved, but amenities could not be updated. Try again.");
  return { ok: true, data: undefined };
}

export async function getMyUnit(propertyId: string, unitId: string): Promise<Unit | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("*").eq("id", unitId).eq("property_id", propertyId).maybeSingle();
  return (data as Unit | null) ?? null;
}

export async function listUnits(propertyId: string): Promise<Unit[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("*").eq("property_id", propertyId).order("unit_number");
  return (data ?? []) as Unit[];
}

const unitRow = (v: UnitInput) => ({
  unit_number: v.unitNumber,
  unit_type: v.unitType ?? null,
  floor_number: v.floorNumber ?? null,
  bedrooms: v.bedrooms,
  bathrooms: v.bathrooms,
  monthly_rent: v.monthlyRent,
  security_deposit: v.securityDeposit,
  currency: v.currency,
  description: v.description ?? null,
  available_from: v.availableFrom ?? null,
});

export async function createUnit(propertyId: string, v: UnitInput): Promise<ServiceResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("units").insert({ ...unitRow(v), status: v.status, property_id: propertyId });
  return error ? fail(friendly(error, "Could not add the unit.")) : { ok: true, data: undefined };
}

/** `status` is only written when the unit is not reserved/occupied; those are owned by tenancy RPCs. */
export async function updateUnit(propertyId: string, unitId: string, v: UnitInput): Promise<ServiceResult> {
  const current = await getMyUnit(propertyId, unitId);
  if (!current) return fail("Unit not found.");
  const lifecycleOwned = current.status === "reserved" || current.status === "occupied";
  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update(lifecycleOwned ? unitRow(v) : { ...unitRow(v), status: v.status })
    .eq("id", unitId)
    .eq("property_id", propertyId);
  return error ? fail(friendly(error, "Could not save the unit.")) : { ok: true, data: undefined };
}

export async function listUnitNumbers(propertyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("unit_number").eq("property_id", propertyId);
  return (data ?? []).map((r) => r.unit_number);
}

/**
 * Inserts all units in ONE statement, which Postgres runs atomically: either every unit is added or none is.
 * A concurrent duplicate (unique property+unit number) or RLS failure rolls the whole batch back.
 */
export async function createUnitsBulk(propertyId: string, units: UnitInput[]): Promise<ServiceResult<{ count: number }>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .insert(units.map((v) => ({ ...unitRow(v), status: v.status, property_id: propertyId })));
  if (error) {
    return fail(
      error.code === "23505"
        ? "A unit number in this batch was added by someone else in the meantime. Nothing was saved; re-check and try again."
        : `${friendly(error, "Could not add the units.")} Nothing was saved.`,
    );
  }
  return { ok: true, data: { count: units.length } };
}
