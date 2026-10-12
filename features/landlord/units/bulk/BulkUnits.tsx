"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { emptyRow, type BulkRow, type RowError } from "@/lib/validation/bulkUnits";
import { bulkUnitsAction } from "../actions";
import { CsvImport } from "./CsvImport";
import { GeneratorWizard } from "./GeneratorWizard";
import { PreviewTable } from "./PreviewTable";
import { primaryBtn, secondaryBtn } from "./ui";

type Source = "generator" | "file";

const FIELD_LABEL: Record<string, string> = {
  unitNumber: "Unit number", floor: "Floor", unitType: "Type", bedrooms: "Bedrooms", bathrooms: "Bathrooms",
  monthlyRent: "Rent", securityDeposit: "Deposit", currency: "Currency", description: "Description", row: "Row",
};

/**
 * Bulk add: pick a source (generator or file), review/edit the preview, validate, then commit.
 * Validation always runs on the server; the commit inserts every unit in one atomic statement.
 */
export function BulkUnits({ propertyId }: { propertyId: string }) {
  const [source, setSource] = useState<Source>("generator");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const load = (next: BulkRow[]) => {
    setRows(next);
    setErrors([]);
    setNotice(null);
    setCreated(null);
  };
  const edit = (i: number, field: keyof BulkRow, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setNotice(null);
    setErrors((es) => es.filter((e) => !(e.row === i + 1 && e.field === field)));
  };
  const remove = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setErrors([]); // row numbers shifted; re-validate to get fresh ones
    setNotice(null);
  };

  function run(commit: boolean) {
    start(async () => {
      setNotice(null);
      try {
        const res = await bulkUnitsAction(propertyId, rows, commit);
        if (res.status === "invalid") {
          setErrors(res.errors);
          setNotice({ kind: "error", text: `${res.errors.length} problem${res.errors.length === 1 ? "" : "s"} found. Nothing was saved.` });
        } else if (res.status === "valid") {
          setErrors([]);
          setNotice({ kind: "ok", text: `All ${res.count} units look good. Ready to add.` });
        } else if (res.status === "created") {
          setErrors([]);
          setRows([]);
          setCreated(res.count);
        } else if (res.status === "error") {
          setNotice({ kind: "error", text: res.message });
        }
      } catch {
        setNotice({ kind: "error", text: "Something went wrong. Nothing was saved; please try again." });
      }
    });
  }

  if (created !== null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="font-medium">Added {created} unit{created === 1 ? "" : "s"}.</p>
        <div className="mt-4 flex gap-3">
          <Link href={`/landlord/properties/${propertyId}`} className={primaryBtn}>View property</Link>
          <button type="button" onClick={() => setCreated(null)} className={secondaryBtn}>Add more</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div role="radiogroup" aria-label="Bulk source" className="mb-5 flex flex-wrap gap-2 text-sm">
          {([
            ["generator", "Option A: Floor generator"],
            ["file", "Option B: CSV / Excel import"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={source === id}
              onClick={() => setSource(id)}
              className={`rounded-full border px-4 py-1.5 ${
                source === id ? "border-foreground font-medium" : "border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {source === "generator" ? <GeneratorWizard onGenerate={load} /> : <CsvImport onRows={load} />}
      </div>

      {rows.length > 0 ? (
        <section aria-label="Preview" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Preview ({rows.length} units)</h2>
            <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className={secondaryBtn}>
              Add row
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Edit any cell, for example a different rent for a corner unit. * = required.
          </p>

          {notice ? (
            <p
              role={notice.kind === "error" ? "alert" : "status"}
              className={`rounded-lg px-3 py-2 text-sm ${
                notice.kind === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-success/10 text-success"
              }`}
            >
              {notice.text}
            </p>
          ) : null}

          {errors.length > 0 ? (
            <div className="rounded-lg border border-destructive/50 p-4">
              <p className="mb-2 text-sm font-medium">Fix these before adding:</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                {errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0 ? `Row ${e.row}` : "Batch"} · {FIELD_LABEL[e.field] ?? e.field}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <PreviewTable rows={rows} errors={errors} onChange={edit} onRemove={remove} />

          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => run(false)} className={secondaryBtn}>
              {pending ? "Checking…" : "Validate"}
            </button>
            <button type="button" disabled={pending} onClick={() => run(true)} className={primaryBtn}>
              {pending ? "Saving…" : `Add ${rows.length} unit${rows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
