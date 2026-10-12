"use server";

import { revalidatePath } from "next/cache";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { generateInvoices, recordReadings, updateBillingSettings, type GeneratedInvoice } from "@/lib/services/billing";
import {
  billingSettingsSchema, monthToPeriod, readingsFromEntries, type ReadingEntry, type ReadingRowError,
} from "@/lib/validation/billing";
import type { FormState } from "@/types/forms";

const refresh = (propertyId: string) => revalidatePath(`/landlord/properties/${propertyId}`);

export async function saveBillingSettingsAction(propertyId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("landlord"); // billing configuration is the owner's alone
  const parsed = billingSettingsSchema.safeParse({
    defaultGarbageFee: formData.get("defaultGarbageFee") ?? "",
    waterRatePerUnit: formData.get("waterRatePerUnit") ?? "",
    latePenaltyPercentage: formData.get("latePenaltyPercentage") ?? "",
    rentDueDay: formData.get("rentDueDay") ?? "",
    mpesaPaybill: formData.get("mpesaPaybill") ?? "",
    paymentInstructions: formData.get("paymentInstructions") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const r = await updateBillingSettings(propertyId, parsed.data);
  if (!r.ok) return { status: "error", message: r.message };
  refresh(propertyId);
  return { status: "success", message: "Billing settings saved. They apply to readings and invoices from now on." };
}

export type ReadingsResult =
  | { status: "saved"; count: number }
  | { status: "error"; message: string; rowErrors?: ReadingRowError[] };

/** Saves one month of meter readings atomically. The water bill is computed by the database, not the client. */
export async function saveReadingsAction(propertyId: string, month: string, entries: ReadingEntry[]): Promise<ReadingsResult> {
  await requireRole(OPERATOR_ROLES);
  const period = monthToPeriod(month);
  if (!period) return { status: "error", message: "Choose a valid month." };
  const { readings, errors } = readingsFromEntries(entries);
  if (errors.length) return { status: "error", message: "Fix the highlighted rows. Nothing was saved.", rowErrors: errors };
  if (readings.length === 0) return { status: "error", message: "Enter at least one reading." };
  const r = await recordReadings(propertyId, period, readings);
  if (!r.ok) return { status: "error", message: r.message, rowErrors: r.rowErrors };
  refresh(propertyId);
  return { status: "saved", count: r.data.count };
}

export type GenerateResult =
  | { status: "done"; results: GeneratedInvoice[] }
  | { status: "error"; message: string };

/** One consolidated invoice per active tenancy: rent + water + garbage + late penalty (+ carried balance). */
export async function generateInvoicesAction(propertyId: string, month: string, requireReadings: boolean): Promise<GenerateResult> {
  await requireRole(OPERATOR_ROLES);
  const period = monthToPeriod(month);
  if (!period) return { status: "error", message: "Choose a valid month." };
  const r = await generateInvoices(propertyId, period, requireReadings);
  if (!r.ok) return { status: "error", message: r.message };
  refresh(propertyId);
  return { status: "done", results: r.data };
}
