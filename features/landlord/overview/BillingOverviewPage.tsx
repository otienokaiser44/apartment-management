import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { openInvoicesByProperty } from "@/lib/services/overview";
import { listMyProperties } from "@/lib/services/properties";

const btn = "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";

/** Billing entry point: pick a property to record meter readings, generate invoices or review the ledger. */
export async function BillingOverviewPage() {
  const [properties, open] = await Promise.all([listMyProperties(), openInvoicesByProperty()]);
  return (
    <>
      <PageHeader title="Billing & utilities" description="Meter readings, monthly invoices and what is still owed." />
      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {properties.map((p) => {
            const o = open.get(p.id);
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {o ? `${o.count} open invoice${o.count === 1 ? "" : "s"} · ${o.currency} ${o.amount.toLocaleString()} owed` : "No open invoices"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className={btn} href={`/landlord/properties/${p.id}?tab=billing`}>Meter readings &amp; invoices</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
