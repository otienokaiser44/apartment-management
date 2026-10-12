import { z } from "zod";
import { parseCsv } from "./bulkUnits.ts";

export const MAX_ROSTER_ROWS = 500;

export type RosterRow = { unit_number: string; tenant_name: string; tenant_email: string; tenant_phone: string };
export type RosterRowError = { row: number; unit_number?: string; error: string };

export const ROSTER_CSV_TEMPLATE = "unit_number,tenant_name,tenant_email,tenant_phone\nA01,Jane Doe,jane@example.com,+254700000000\n";

const HEADERS = ["unit_number", "tenant_name", "tenant_email", "tenant_phone"] as const;

/** Header + data matrix (CSV or XLSX) -> roster rows. Unknown columns are ignored. */
export function rosterFromMatrix(matrix: string[][]): { rows: RosterRow[] } | { error: string } {
  if (matrix.length === 0) return { error: "The file is empty." };
  const header = matrix[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  if (!header.includes("unit_number")) return { error: "Missing required column: unit_number. Use the template." };
  if (!header.includes("tenant_email") && !header.includes("tenant_phone")) {
    return { error: "Include a tenant_email or tenant_phone column." };
  }
  const data = matrix.slice(1);
  if (data.length === 0) return { error: "The file has headers but no rows." };
  if (data.length > MAX_ROSTER_ROWS) return { error: `Too many rows (${data.length}). Maximum is ${MAX_ROSTER_ROWS}.` };
  const rows = data.map((cells) => {
    const r: RosterRow = { unit_number: "", tenant_name: "", tenant_email: "", tenant_phone: "" };
    header.forEach((h, i) => {
      if ((HEADERS as readonly string[]).includes(h)) r[h as keyof RosterRow] = (cells[i] ?? "").trim();
    });
    return r;
  });
  return { rows };
}

export const parseRosterCsv = (text: string) => rosterFromMatrix(parseCsv(text));

const email = z.string().trim().max(254).pipe(z.email());

/**
 * Cheap pre-check so obvious mistakes are reported before a round trip. The database function repeats these
 * checks (and the unit/occupancy ones) and is the authority; it reports every bad row at once.
 */
export function precheckRoster(rows: RosterRow[]): RosterRowError[] {
  const errors: RosterRowError[] = [];
  if (rows.length === 0) return [{ row: 0, error: "Add at least one row." }];
  if (rows.length > MAX_ROSTER_ROWS) return [{ row: 0, error: `At most ${MAX_ROSTER_ROWS} rows per upload.` }];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = i + 1;
    const key = r.unit_number.trim().toLowerCase();
    if (!key) return void errors.push({ row, error: "unit_number is required" });
    if (seen.has(key)) return void errors.push({ row, unit_number: r.unit_number, error: "duplicate unit_number in roster" });
    seen.add(key);
    if (!r.tenant_email.trim() && !r.tenant_phone.trim()) {
      return void errors.push({ row, unit_number: r.unit_number, error: "tenant_email or tenant_phone is required" });
    }
    if (r.tenant_email.trim() && !email.safeParse(r.tenant_email).success) {
      errors.push({ row, unit_number: r.unit_number, error: "tenant_email is not a valid email" });
    }
  });
  return errors;
}

/** Landlord links an existing account: at least one contact detail. */
export const linkExistingSchema = z
  .object({
    unitId: z.guid("Choose a unit."),
    email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), email.optional()),
    phone: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().max(20).regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.").optional(),
    ),
  })
  .refine((v) => v.email || v.phone, { path: ["email"], message: "Enter the tenant's email or phone." });

/** Tenant asks to be linked: property code + unit number. */
export const unitRequestSchema = z.object({
  propertyCode: z.string().trim().toUpperCase().regex(/^[A-HJKMNP-Z2-9]{8}$/, "Enter the 8-character property code."),
  unitNumber: z.string().trim().min(1, "Enter the unit number.").max(40),
  message: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(1000).optional()),
});

export const inviteTokenSchema = z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);
