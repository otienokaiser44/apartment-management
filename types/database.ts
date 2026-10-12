/** Hand-maintained row types for the property domain (mirrors supabase/migrations 004-006). Replace with generated types when the local stack is available. */
export const PROPERTY_TYPES = ["apartment", "house", "villa", "townhouse", "hostel", "commercial", "other"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type PropertyStatus = "draft" | "published" | "unpublished" | "suspended" | "archived";
export type VerificationStatus = "unverified" | "pending" | "under_review" | "verified" | "rejected" | "suspended";
export type UnitStatus = "vacant" | "reserved" | "occupied" | "maintenance" | "unavailable";
/** Statuses a landlord may set directly. reserved/occupied are owned by tenancy RPCs. */
export const LANDLORD_UNIT_STATUSES = ["vacant", "maintenance", "unavailable"] as const;

export type Property = {
  id: string;
  landlord_id: string;
  name: string;
  /** Short code tenants type to find this property. */
  property_code: string;
  property_type: PropertyType;
  description: string | null;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  county_or_region: string | null;
  postal_code: string | null;
  country: string;
  status: PropertyStatus;
  verification_status: VerificationStatus;
  created_at: string;
};

export type Unit = {
  id: string;
  property_id: string;
  unit_number: string;
  unit_type: string | null;
  floor_number: number | null;
  bedrooms: number;
  bathrooms: number;
  monthly_rent: number;
  security_deposit: number;
  currency: string;
  description: string | null;
  status: UnitStatus;
  available_from: string | null;
};

export type Amenity = { id: string; name: string; slug: string };

export type PropertySummary = Pick<Property, "id" | "name" | "city" | "status" | "verification_status"> & {
  units: Pick<Unit, "id" | "status">[];
};
