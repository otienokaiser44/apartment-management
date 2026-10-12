"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { createUnit, createUnitsBulk, getMyProperty, listUnitNumbers, updateUnit } from "@/lib/services/properties";
import { validateBulkRows, type BulkRow, type RowError } from "@/lib/validation/bulkUnits";
import { unitSchema } from "@/lib/validation/properties";
import type { FormState } from "@/types/forms";

const KEYS = [
  "unitNumber", "unitType", "floorNumber", "bedrooms", "bathrooms", "monthlyRent",
  "securityDeposit", "currency", "description", "status", "availableFrom",
] as const;

function parse(fd: FormData) {
  const raw: Record<string, string> = {};
  for (const k of KEYS) {
    const v = fd.get(k);
    raw[k] = typeof v === "string" ? v : "";
  }
  // Blank status/currency fall back to the schema defaults.
  if (!raw.status) delete raw.status;
  if (!raw.currency) delete raw.currency;
  return unitSchema.safeParse(raw);
}

const invalid = (fieldErrors: FormState["fieldErrors"]): FormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors,
});

export async function createUnitAction(propertyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await createUnit(propertyId, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/landlord/properties/${propertyId}`);
}

export async function updateUnitAction(
  propertyId: string,
  unitId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireRole(OPERATOR_ROLES);
  const parsed = parse(formData);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const result = await updateUnit(propertyId, unitId, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/landlord/properties/${propertyId}`);
}

export type BulkResult =
  | { status: "idle" }
  | { status: "invalid"; errors: RowError[] }
  | { status: "valid"; count: number }
  | { status: "created"; count: number }
  | { status: "error"; message: string };

/**
 * Validates a batch (types, required fields, duplicates in the batch and in the property). With `commit` it also
 * inserts every unit atomically. Ownership is enforced by RLS; the property id only selects where to add.
 */
export async function bulkUnitsAction(propertyId: string, rows: BulkRow[], commit: boolean): Promise<BulkResult> {
  await requireRole(OPERATOR_ROLES);
  if (!(await getMyProperty(propertyId))) return { status: "error", message: "Property not found." };
  const existing = await listUnitNumbers(propertyId);
  const result = validateBulkRows(rows, existing);
  if (!result.ok) return { status: "invalid", errors: result.errors };
  if (!commit) return { status: "valid", count: result.units.length };
  const created = await createUnitsBulk(propertyId, result.units);
  if (!created.ok) return { status: "error", message: created.message };
  revalidatePath(`/landlord/properties/${propertyId}`);
  return { status: "created", count: created.data.count };
}
