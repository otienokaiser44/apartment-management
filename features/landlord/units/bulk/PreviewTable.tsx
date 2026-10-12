"use client";

import type { BulkRow, RowError } from "@/lib/validation/bulkUnits";

type Props = {
  rows: BulkRow[];
  errors: RowError[];
  onChange: (index: number, field: keyof BulkRow, value: string) => void;
  onRemove: (index: number) => void;
};

const COLUMNS: { field: keyof BulkRow; label: string; width: string }[] = [
  { field: "unitNumber", label: "Unit *", width: "w-24" },
  { field: "floor", label: "Floor", width: "w-16" },
  { field: "unitType", label: "Type", width: "w-32" },
  { field: "bedrooms", label: "Beds *", width: "w-16" },
  { field: "bathrooms", label: "Baths *", width: "w-16" },
  { field: "monthlyRent", label: "Rent *", width: "w-28" },
  { field: "securityDeposit", label: "Deposit", width: "w-28" },
  { field: "currency", label: "Curr.", width: "w-16" },
  { field: "description", label: "Description", width: "w-48" },
];

/** Editable grid of the batch. Cells with problems are outlined red and carry their message. */
export function PreviewTable({ rows, errors, onChange, onRemove }: Props) {
  const byCell = new Map<string, string>();
  for (const e of errors) byCell.set(`${e.row}:${e.field}`, e.message);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-2">#</th>
            {COLUMNS.map((c) => (
              <th key={c.field} className="px-1 py-2">{c.label}</th>
            ))}
            <th className="px-2 py-2"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rowMessage = byCell.get(`${i + 1}:row`);
            return (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1 text-xs text-muted-foreground">{i + 1}</td>
                {COLUMNS.map((c) => {
                  const message = byCell.get(`${i + 1}:${c.field}`);
                  return (
                    <td key={c.field} className="px-1 py-1">
                      <input
                        value={r[c.field]}
                        onChange={(e) => onChange(i, c.field, e.target.value)}
                        aria-label={`${c.label.replace(" *", "")}, row ${i + 1}`}
                        aria-invalid={message ? true : undefined}
                        title={message}
                        className={`${c.width} rounded border bg-transparent px-2 py-1 text-sm outline-none focus:border-ring ${
                          message ? "border-destructive" : "border-border"
                        }`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    aria-label={`Remove row ${i + 1}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Remove
                  </button>
                  {rowMessage ? <span className="sr-only">{rowMessage}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
