"use client";

import { useRef, useState } from "react";
import { CSV_TEMPLATE, matrixToRows, parseCsv, type BulkRow } from "@/lib/validation/bulkUnits";
import { secondaryBtn } from "./ui";

type Props = { onRows: (rows: BulkRow[]) => void };

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "units-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const cellText = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

/** Option B: template download plus a .csv/.xlsx dropzone. Files are parsed in the browser; nothing is saved until commit. */
export function CsvImport({ onRows }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    const name = file.name.toLowerCase();
    const isXlsx = name.endsWith(".xlsx");
    if (!isXlsx && !name.endsWith(".csv")) return setError("Upload a .csv or .xlsx file.");
    if (file.size > MAX_FILE_BYTES) return setError("File is too large (max 2 MB).");
    setBusy(true);
    try {
      let matrix: string[][];
      if (isXlsx) {
        const { readSheet } = await import("read-excel-file/browser");
        matrix = (await readSheet(file)).map((r) => r.map(cellText));
      } else {
        matrix = parseCsv(await file.text());
      }
      const result = matrixToRows(matrix);
      if ("error" in result) setError(result.error);
      else onRows(result.rows);
    } catch {
      setError("Could not read that file. Make sure it is a valid .csv or .xlsx (not .xls).");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={downloadTemplate} className={secondaryBtn}>
          Download CSV template
        </button>
        <p className="text-xs text-muted-foreground">
          Columns: unit_number, floor, unit_type, bedrooms, bathrooms, monthly_rent, security_deposit, currency, description.
          Required: unit_number and monthly_rent.
        </p>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files[0]); }}
        className={`rounded-xl border border-dashed border-border bg-card/50 p-8 text-center ${
          over ? "border-foreground bg-muted" : "border-border"
        }`}
      >
        <p className="text-sm font-medium">{busy ? "Reading file…" : "Drag a .csv or .xlsx file here"}</p>
        <p className="mt-1 text-xs text-muted-foreground">or</p>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${secondaryBtn} mt-2`}>
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Upload units file"
          onChange={(e) => void handle(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
