"use client";

import { Receipt } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { GeneratedInvoice } from "@/lib/services/billing";
import { generateInvoicesAction } from "./actions";

/** Generates the month's consolidated invoices and reports what was created and what was skipped (and why). */
export function GenerateInvoicesPanel({ propertyId, month }: { propertyId: string; month: string }) {
  const [requireReadings, setRequireReadings] = useState(true);
  const [results, setResults] = useState<GeneratedInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      setError(null);
      setResults(null);
      try {
        const res = await generateInvoicesAction(propertyId, month, requireReadings);
        if (res.status === "done") setResults(res.results);
        else setError(res.message);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  const created = results?.filter((r) => r.invoice_id) ?? [];
  const skipped = results?.filter((r) => !r.invoice_id) ?? [];

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={requireReadings} onChange={(e) => setRequireReadings(e.target.checked)} />
        <span>
          Skip units with no meter reading
          <span className="block text-xs text-muted-foreground">Recommended. Otherwise those units are billed no water.</span>
        </span>
      </label>
      <Button icon={Receipt} loading={pending} loadingText="Generating…" onClick={run}>
        Generate invoices for {month}
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {results ? (
        <Alert variant={created.length ? "success" : "info"}>
          <p className="font-medium">
            {created.length} invoice{created.length === 1 ? "" : "s"} created{skipped.length ? `, ${skipped.length} skipped` : ""}.
          </p>
          {skipped.length ? (
            <ul className="mt-1 space-y-0.5 text-xs opacity-90">
              {skipped.map((s) => (
                <li key={s.tenancy_id}>
                  Unit {s.unit_number}: {s.skipped_reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
