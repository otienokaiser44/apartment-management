"use client";

import { Droplets, Save, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import type { MeterRow } from "@/lib/services/billing";
import { waterBill, type ReadingEntry, type ReadingRowError } from "@/lib/validation/billing";
import { saveReadingsAction } from "./actions";

type Props = { propertyId: string; month: string; rate: number; currency: string; rows: MeterRow[] };

const cell = `${controlClass} w-28 px-2 py-1`;
const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Monthly meter-reading calculator. Type the current reading (or the units consumed) per unit; the water bill
 * previews as units x rate. The database recomputes and stores the authoritative amount on save.
 */
export function MeterReadingsGrid({ propertyId, month, rate, currency, rows }: Props) {
  const [entries, setEntries] = useState<Record<string, { current: string; consumed: string }>>({});
  const [errors, setErrors] = useState<ReadingRowError[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Droplets}
        title="No occupied units found"
        hint="Invite your first tenant to enable meter readings. Readings are taken for units with an active tenant."
        action={
          <Link href={`/landlord/properties/${propertyId}?tab=tenants#invite`} className={buttonVariants()}>
            <UserPlus className="size-4" aria-hidden />
            Invite a tenant
          </Link>
        }
      />
    );
  }

  const get = (id: string) => entries[id] ?? { current: "", consumed: "" };
  const set = (id: string, patch: Partial<{ current: string; consumed: string }>) => {
    setEntries((e) => ({ ...e, [id]: { ...get(id), ...patch } }));
    setErrors((es) => es.filter((x) => x.unit_id !== id));
    setMessage(null);
  };

  function preview(r: MeterRow): { consumed: number; bill: number } | { note: string } | null {
    const e = get(r.unit_id);
    const cur = e.current.trim();
    const con = e.consumed.trim();
    if (cur && con) return { note: "Use only one field" };
    if (cur) {
      const n = Number(cur);
      if (!Number.isFinite(n) || n < 0) return { note: "Not a valid reading" };
      if (r.previous_reading === null) return { note: "First reading: sets the baseline" };
      if (n < r.previous_reading) return { note: `Below previous (${r.previous_reading})` };
      const used = Math.round((n - r.previous_reading) * 1000) / 1000;
      return { consumed: used, bill: waterBill(used, rate) };
    }
    if (con) {
      const n = Number(con);
      if (!Number.isFinite(n) || n < 0) return { note: "Not a valid number" };
      return { consumed: n, bill: waterBill(n, rate) };
    }
    return null;
  }

  function save() {
    const payload: ReadingEntry[] = rows
      .filter((r) => !r.invoiced)
      .map((r) => ({ unitId: r.unit_id, current: get(r.unit_id).current, consumed: get(r.unit_id).consumed }));
    start(async () => {
      setMessage(null);
      try {
        const res = await saveReadingsAction(propertyId, month, payload);
        if (res.status === "saved") {
          setErrors([]);
          setEntries({});
          setMessage({ kind: "ok", text: `${res.count} reading${res.count === 1 ? "" : "s"} saved.` });
        } else {
          setErrors(res.rowErrors ?? []);
          setMessage({ kind: "error", text: res.message });
        }
      } catch {
        setMessage({ kind: "error", text: "Something went wrong. Nothing was saved." });
      }
    });
  }

  // Server row numbers index the submitted (non-invoiced) list; map them back to units for display.
  const submitted = rows.filter((r) => !r.invoiced);
  const errorFor = (id: string) => {
    const direct = errors.filter((e) => e.unit_id === id).map((e) => e.error).join("; ");
    if (direct) return direct;
    const idx = submitted.findIndex((r) => r.unit_id === id);
    return errors.filter((e) => !e.unit_id && e.row === idx + 1).map((e) => e.error).join("; ");
  };

  return (
    <div className="space-y-4">
      {message ? <Alert variant={message.kind === "error" ? "error" : "success"}>{message.text}</Alert> : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className={th}>Unit</th>
              <th className={th}>Previous</th>
              <th className={th}>Current reading</th>
              <th className={th}>or Units used</th>
              <th className={th}>Water bill</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = preview(r);
              const err = errorFor(r.unit_id);
              return (
                <tr key={r.unit_id} className={`border-b border-border/60 last:border-0 ${err ? "bg-destructive/10" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    {r.unit_number}
                    <span className="block text-xs font-normal text-muted-foreground">{r.tenant_name}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.previous_reading ?? "—"}</td>
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Current reading, unit ${r.unit_number}`}
                      className={cell}
                      inputMode="decimal"
                      disabled={r.invoiced}
                      value={get(r.unit_id).current}
                      onChange={(e) => set(r.unit_id, { current: e.target.value })}
                      placeholder={r.recorded ? String(r.recorded.current_reading) : "0.0"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Units used, unit ${r.unit_number}`}
                      className={cell}
                      inputMode="decimal"
                      disabled={r.invoiced}
                      value={get(r.unit_id).consumed}
                      onChange={(e) => set(r.unit_id, { consumed: e.target.value })}
                      placeholder={r.recorded ? String(r.recorded.units_consumed) : "m³"}
                    />
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {p && "bill" in p ? (
                      <span>
                        {p.consumed} × {rate} = <strong>{currency} {fmt(p.bill)}</strong>
                      </span>
                    ) : p ? (
                      <span className="text-xs text-warning">{p.note}</span>
                    ) : r.recorded ? (
                      <span className="text-muted-foreground">
                        {r.recorded.units_consumed} m³ = {currency} {fmt(r.recorded.water_amount)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {err ? (
                      <span className="text-destructive">{err}</span>
                    ) : r.invoiced ? (
                      <span className="text-muted-foreground">Invoiced (locked)</span>
                    ) : r.recorded ? (
                      <span className="text-success">Saved</span>
                    ) : (
                      <span className="text-muted-foreground">Not read</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Save} loading={pending} loadingText="Saving…" onClick={save}>
          Save readings
        </Button>
        <p className="text-xs text-muted-foreground">
          Leave a row blank to skip it. A unit&apos;s first reading becomes its baseline (nothing billed); enter the units used to bill immediately.
        </p>
      </div>
    </div>
  );
}
