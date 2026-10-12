import { z } from "zod";
import { NOTICE_CATEGORIES } from "./portal.ts";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Property billing configuration. Percent is 0-100; due day is capped at 28 so every month has it. */
export const billingSettingsSchema = z.object({
  defaultGarbageFee: z.coerce.number("Garbage fee must be a number.").min(0, "Cannot be negative.").max(1_000_000),
  waterRatePerUnit: z.coerce.number("Water rate must be a number.").min(0, "Cannot be negative.").max(100_000),
  latePenaltyPercentage: z.coerce.number("Penalty must be a number.").min(0, "Cannot be negative.").max(100, "At most 100%."),
  rentDueDay: z.coerce.number("Due day must be a number.").int("Use a whole day.").min(1, "1 to 28.").max(28, "1 to 28."),
  // How tenants pay. Optional: shown on their statement.
  mpesaPaybill: z.preprocess(blank, z.string().trim().regex(/^[0-9]{5,7}$/, "A Paybill number is 5 to 7 digits.").optional()),
  paymentInstructions: z.preprocess(blank, z.string().trim().max(1000, "Keep it under 1000 characters.").optional()),
});
export type BillingSettingsInput = z.infer<typeof billingSettingsSchema>;

/** "2026-10" -> "2026-10-01" (first of the month), or null. */
export function monthToPeriod(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** "YYYY-MM" for the month containing `d` (local time). */
export const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Water bill preview: units consumed x rate, rounded to cents. The database recomputes it authoritatively. */
export const waterBill = (unitsConsumed: number, rate: number) => Math.round(unitsConsumed * rate * 100) / 100;

export type ReadingInput = { unit_id: string; current_reading?: number; units_consumed?: number };
export type ReadingRowError = { row: number; unit_id?: string; error: string };

/** One meter-grid row as typed by the user: either a current reading or the units consumed. */
export type ReadingEntry = { unitId: string; current: string; consumed: string };

/**
 * Turns the grid into RPC input. Blank rows are skipped (not every unit has a reading every month).
 * A row with both fields filled, or a non-numeric/negative value, is reported with its position.
 */
export function readingsFromEntries(entries: ReadingEntry[]): { readings: ReadingInput[]; errors: ReadingRowError[] } {
  const readings: ReadingInput[] = [];
  const errors: ReadingRowError[] = [];
  entries.forEach((e, i) => {
    const cur = e.current.trim();
    const con = e.consumed.trim();
    if (!cur && !con) return;
    if (cur && con) return void errors.push({ row: i + 1, unit_id: e.unitId, error: "Enter either the current reading or the units consumed, not both." });
    const raw = cur || con;
    const n = Number(raw);
    if (!Number.isFinite(n)) return void errors.push({ row: i + 1, unit_id: e.unitId, error: "Enter a number." });
    if (n < 0) return void errors.push({ row: i + 1, unit_id: e.unitId, error: "Cannot be negative." });
    readings.push(cur ? { unit_id: e.unitId, current_reading: n } : { unit_id: e.unitId, units_consumed: n });
  });
  return { readings, errors };
}

export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(150),
    message: z.string().trim().min(1, "Enter a message.").max(5000),
    audience: z.enum(["all", "floor", "unit", "unpaid_only"], { error: "Choose who receives it." }),
    category: z.enum(NOTICE_CATEGORIES, { error: "Choose a category." }).default("general"),
    value: z.preprocess(blank, z.string().trim().max(60).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "floor" && !(v.value && /^-?\d{1,3}$/.test(v.value))) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the floor number." });
    }
    if (v.audience === "unit" && !v.value) ctx.addIssue({ code: "custom", path: ["value"], message: "Choose a unit." });
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;
