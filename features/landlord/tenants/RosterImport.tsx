"use client";

import { useRef, useState, useTransition } from "react";
import { parseCsv } from "@/lib/validation/bulkUnits";
import {
  precheckRoster, ROSTER_CSV_TEMPLATE, rosterFromMatrix, type RosterRow, type RosterRowError,
} from "@/lib/validation/onboarding";
import type { InvitationIssued } from "@/lib/services/onboarding";
import { inviteRosterAction } from "./actions";

const btn = "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60";
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const cellText = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([ROSTER_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "tenant-roster-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Scenario A UI: upload a roster (.csv/.xlsx), review it, create all invitations in one atomic call. */
export function RosterImport({ propertyId }: { propertyId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [errors, setErrors] = useState<RosterRowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [issued, setIssued] = useState<InvitationIssued[] | null>(null);
  const [pending, start] = useTransition();

  async function load(file: File | undefined) {
    if (!file) return;
    setErrors([]); setMessage(null); setIssued(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) return setMessage("Upload a .csv or .xlsx file.");
    if (file.size > MAX_FILE_BYTES) return setMessage("File is too large (max 2 MB).");
    try {
      let matrix: string[][];
      if (name.endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser");
        matrix = (await readSheet(file)).map((r) => r.map(cellText));
      } else matrix = parseCsv(await file.text());
      const parsed = rosterFromMatrix(matrix);
      if ("error" in parsed) { setRows([]); setMessage(parsed.error); }
      else { setRows(parsed.rows); setErrors(precheckRoster(parsed.rows)); }
    } catch {
      setRows([]);
      setMessage("Could not read that file.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function submit() {
    start(async () => {
      setMessage(null);
      try {
        const res = await inviteRosterAction(propertyId, rows);
        if (res.status === "created") { setIssued(res.issued); setRows([]); setErrors([]); }
        else { setMessage(res.message); setErrors(res.rowErrors ?? []); }
      } catch {
        setMessage("Something went wrong. Nothing was saved.");
      }
    });
  }

  const rowError = (i: number) => errors.filter((e) => e.row === i + 1).map((e) => e.error).join("; ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={downloadTemplate} className={btn}>Download template</button>
        <button type="button" onClick={() => input.current?.click()} className={btn}>Choose roster file</button>
        <input ref={input} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Upload tenant roster"
          onChange={(e) => void load(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">Columns: unit_number, tenant_name, tenant_email, tenant_phone.</p>
      </div>

      {message ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p> : null}

      {issued ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <p className="mb-2 text-sm font-medium">{issued.length} invitation{issued.length === 1 ? "" : "s"} created.</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Links are shown once. Share each with its tenant; the tenant must sign up or log in with the invited email/phone.
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
            {issued.map((i) => (
              <li key={i.claimUrl} className="break-all"><strong>{i.unitNumber}</strong> {i.name ?? i.email ?? i.phone}: {i.claimUrl}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Issue</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-border/60 last:border-0 ${rowError(i) ? "bg-destructive/10" : ""}`}>
                    <td className="px-3 py-1.5 text-xs">{i + 1}</td>
                    <td className="px-3 py-1.5">{r.unit_number}</td>
                    <td className="px-3 py-1.5">{r.tenant_name}</td>
                    <td className="px-3 py-1.5">{r.tenant_email}</td>
                    <td className="px-3 py-1.5">{r.tenant_phone}</td>
                    <td className="px-3 py-1.5 text-xs text-destructive">{rowError(i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button type="button" disabled={pending} onClick={submit} className={primary}>
              {pending ? "Creating…" : `Create ${rows.length} invitation${rows.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" disabled={pending} onClick={() => { setRows([]); setErrors([]); setMessage(null); }} className={btn}>Clear</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
