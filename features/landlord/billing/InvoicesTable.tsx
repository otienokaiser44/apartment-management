import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { StatusBadge } from "@/components/layout/StatusBadge";
import type { InvoiceRow } from "@/lib/services/billing";

const money = (n: number, c: string) => `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Invoice breakdown table / ledger. Status is derived from payments (unpaid, partial, paid). */
export function InvoicesTable({ invoices, showPeriod }: { invoices: InvoiceRow[]; showPeriod?: boolean }) {
  if (invoices.length === 0) {
    return <EmptyState icon={Receipt} title="No invoices yet" hint="Record this month's meter readings, then generate the invoices to bill your tenants." />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className={th}>Unit</th>
            {showPeriod ? <th className={th}>Month</th> : null}
            <th className={th}>Rent</th>
            <th className={th}>Water</th>
            <th className={th}>Garbage</th>
            <th className={th}>Penalty</th>
            <th className={th}>Previous</th>
            <th className={th}>Total due</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.invoice_id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">{i.unit_number}</td>
              {showPeriod ? <td className="px-4 py-3">{i.billing_period_start.slice(0, 7)}</td> : null}
              <td className="px-4 py-3 tabular-nums">{money(i.base_rent, i.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(i.water_bill, i.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(i.garbage_fee, i.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(i.late_penalty, i.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(i.previous_balance, i.currency)}</td>
              <td className="px-4 py-3 font-semibold tabular-nums">{money(i.total_amount, i.currency)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={i.status === "partial" ? "partially_paid" : i.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
