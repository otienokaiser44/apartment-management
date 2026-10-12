import { unitSchema, type UnitInput } from "./properties.ts";

/** Hard cap per submission; keeps one request/insert reasonable. */
export const MAX_BULK_UNITS = 500;

/** One editable row of the bulk preview. Everything is text so invalid input can be shown and corrected. */
export type BulkRow = {
  unitNumber: string;
  floor: string;
  unitType: string;
  bedrooms: string;
  bathrooms: string;
  monthlyRent: string;
  securityDeposit: string;
  currency: string;
  description: string;
};

export const BULK_FIELDS = [
  "unitNumber", "floor", "unitType", "bedrooms", "bathrooms", "monthlyRent", "securityDeposit", "currency", "description",
] as const satisfies readonly (keyof BulkRow)[];

export type RowError = { row: number; field: keyof BulkRow | "row"; message: string };

export type BulkValidation =
  | { ok: true; units: UnitInput[] }
  | { ok: false; errors: RowError[] };

export const emptyRow = (): BulkRow => ({
  unitNumber: "", floor: "", unitType: "", bedrooms: "", bathrooms: "",
  monthlyRent: "", securityDeposit: "", currency: "", description: "",
});

// --- CSV template / parsing -----------------------------------------------------------

/** Column headers, matching the database column names. */
export const CSV_HEADERS = [
  "unit_number", "floor", "unit_type", "bedrooms", "bathrooms", "monthly_rent", "security_deposit", "currency", "description",
] as const;

const HEADER_TO_FIELD: Record<(typeof CSV_HEADERS)[number], keyof BulkRow> = {
  unit_number: "unitNumber",
  floor: "floor",
  unit_type: "unitType",
  bedrooms: "bedrooms",
  bathrooms: "bathrooms",
  monthly_rent: "monthlyRent",
  security_deposit: "securityDeposit",
  currency: "currency",
  description: "description",
};

export const CSV_TEMPLATE = `${CSV_HEADERS.join(",")}\n101,1,2-bedroom,2,1,45000,45000,KES,Corner unit\n102,1,2-bedroom,2,1,42000,42000,KES,\n`;

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, BOM. Returns rows of cells. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Turns a header + data matrix (from CSV or XLSX) into rows. Unknown columns are ignored; required headers must exist. */
export function matrixToRows(matrix: string[][]): { rows: BulkRow[] } | { error: string } {
  if (matrix.length === 0) return { error: "The file is empty." };
  const header = matrix[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const missing = (["unit_number", "monthly_rent"] as const).filter((h) => !header.includes(h));
  if (missing.length) return { error: `Missing required column(s): ${missing.join(", ")}. Use the template.` };
  const data = matrix.slice(1);
  if (data.length === 0) return { error: "The file has headers but no rows." };
  if (data.length > MAX_BULK_UNITS) return { error: `Too many rows (${data.length}). Maximum is ${MAX_BULK_UNITS}.` };
  const rows = data.map((cells) => {
    const r = emptyRow();
    header.forEach((h, idx) => {
      const field = HEADER_TO_FIELD[h as keyof typeof HEADER_TO_FIELD];
      if (field) r[field] = (cells[idx] ?? "").trim();
    });
    return r;
  });
  return { rows };
}

// --- Generator ------------------------------------------------------------------------

export type GeneratorInput = { floor: number; pattern: string; start: number; end: number };

/**
 * Pattern tokens: `{floor}`, `{number}` and zero-padded `{number:02d}` (any width). Anything else is literal text,
 * so a prefix like `A-{floor}{number:02d}` works. Example: floor 1, `{floor}{number:02d}`, 1..50 -> 101..150.
 */
export function generateUnitNumbers({ floor, pattern, start, end }: GeneratorInput): string[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return [];
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    out.push(
      pattern
        .replace(/\{floor\}/g, String(floor))
        .replace(/\{number(?::0(\d+)d)?\}/g, (_m, w: string | undefined) => String(n).padStart(w ? Number(w) : 0, "0")),
    );
  }
  return out;
}

export function validateGenerator(g: { pattern: string; start: number; end: number; floor: number }): string | null {
  if (!g.pattern.includes("{number")) return "The pattern must contain {number} so every unit gets a different name.";
  if (!Number.isInteger(g.floor)) return "Floor must be a whole number.";
  if (!Number.isInteger(g.start) || !Number.isInteger(g.end) || g.start < 0) return "Start and end must be whole numbers.";
  if (g.end < g.start) return "End must be greater than or equal to start.";
  if (g.end - g.start + 1 > MAX_BULK_UNITS) return `You can generate at most ${MAX_BULK_UNITS} units at once.`;
  return null;
}

// --- Validation -----------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Validates every row (types, required fields) and flags duplicate unit numbers within the batch and against
 * `existingUnitNumbers` already in the property. All problems are returned together so the user can fix them in one pass.
 */
export function validateBulkRows(rows: BulkRow[], existingUnitNumbers: string[]): BulkValidation {
  const errors: RowError[] = [];
  const units: UnitInput[] = [];

  if (rows.length === 0) return { ok: false, errors: [{ row: 0, field: "row", message: "Add at least one unit." }] };
  if (rows.length > MAX_BULK_UNITS) {
    return { ok: false, errors: [{ row: 0, field: "row", message: `At most ${MAX_BULK_UNITS} units per batch.` }] };
  }

  const existing = new Set(existingUnitNumbers.map(norm));
  const firstSeen = new Map<string, number>();

  rows.forEach((r, i) => {
    const row = i + 1;
    const parsed = unitSchema.safeParse({
      unitNumber: r.unitNumber,
      unitType: r.unitType,
      floorNumber: r.floor,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      monthlyRent: r.monthlyRent,
      securityDeposit: r.securityDeposit,
      currency: r.currency || undefined,
      description: r.description,
    });
    if (parsed.success) units.push(parsed.data);
    else {
      const seen = new Set<string>();
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        const field: keyof BulkRow | "row" =
          key === "floorNumber" ? "floor" : (BULK_FIELDS as readonly string[]).includes(key) ? (key as keyof BulkRow) : "row";
        if (seen.has(field)) continue;
        seen.add(field);
        errors.push({ row, field, message: issue.message });
      }
    }

    const key = norm(r.unitNumber);
    if (key) {
      const first = firstSeen.get(key);
      if (first !== undefined) {
        errors.push({ row, field: "unitNumber", message: `Duplicate of row ${first} in this batch.` });
      } else {
        firstSeen.set(key, row);
        if (existing.has(key)) {
          errors.push({ row, field: "unitNumber", message: "A unit with this number already exists in this property." });
        }
      }
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, units };
}
