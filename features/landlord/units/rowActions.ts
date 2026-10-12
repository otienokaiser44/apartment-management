"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { endTenancyToday } from "@/lib/services/tenancies";

/**
 * "Mark vacant" on an occupied unit. Occupancy is owned by tenancies, so this ends the active tenancy
 * (history, invoices and payments are kept) and the database returns the unit to vacant.
 */
export async function markUnitVacantAction(propertyId: string, tenancyId: string) {
  await requireRole(OPERATOR_ROLES);
  const r = await endTenancyToday(tenancyId);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/landlord/properties/${propertyId}`);
  return { ok: true };
}
