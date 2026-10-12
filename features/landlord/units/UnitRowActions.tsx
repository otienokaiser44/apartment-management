"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { UnitStatus } from "@/types/database";
import { markUnitVacantAction } from "./rowActions";

type Props = {
  propertyId: string;
  unit: { id: string; unit_number: string; status: UnitStatus };
  /** Active tenancy of this unit, when there is one (needed to mark it vacant). */
  tenancyId?: string;
};

const item = "block w-full px-3 py-2 text-left text-sm hover:bg-muted";

/** Per-row action menu for the units table. */
export function UnitRowActions({ propertyId, unit, tenancyId }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const base = `/landlord/properties/${propertyId}`;
  const close = () => menu.current?.removeAttribute("open");

  function markVacant() {
    if (!tenancyId) return;
    if (!window.confirm(`Mark unit ${unit.unit_number} vacant? This ends the current tenancy (history is kept).`)) return;
    setError(null);
    start(async () => {
      try {
        const res = await markUnitVacantAction(propertyId, tenancyId);
        if (!res.ok) setError(res.message ?? "Could not end the tenancy.");
        else close();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <details ref={menu} className="relative inline-block text-left">
      <summary className="cursor-pointer list-none rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted" aria-label={`Actions for unit ${unit.unit_number}`}>
        Actions ▾
      </summary>
      <div role="menu" className="absolute right-0 z-10 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <Link role="menuitem" className={item} href={`${base}/units/${unit.id}`} onClick={close}>Edit unit details</Link>
        {unit.status === "vacant" ? (
          <Link role="menuitem" className={item} href={`${base}?tab=tenants&unit=${unit.id}#invite`} onClick={close}>Assign / invite tenant</Link>
        ) : (
          <span role="menuitem" aria-disabled="true" className={`${item} cursor-not-allowed opacity-50`}>Assign / invite tenant (not vacant)</span>
        )}
        <Link role="menuitem" className={item} href={`${base}?tab=billing&unit=${unit.id}`} onClick={close}>View ledger / invoices</Link>
        {unit.status === "occupied" && tenancyId ? (
          <button role="menuitem" type="button" disabled={pending} className={item} onClick={markVacant}>
            {pending ? "Ending tenancy…" : "Mark vacant (ends tenancy)"}
          </button>
        ) : unit.status === "vacant" ? (
          <Link role="menuitem" className={item} href={`${base}?tab=tenants&unit=${unit.id}#invite`} onClick={close}>Mark occupied (assign a tenant)</Link>
        ) : (
          <span role="menuitem" aria-disabled="true" className={`${item} cursor-not-allowed opacity-50`}>Status is managed by tenancy actions</span>
        )}
        {error ? <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p> : null}
      </div>
    </details>
  );
}
