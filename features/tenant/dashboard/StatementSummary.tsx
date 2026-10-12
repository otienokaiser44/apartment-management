import { ArrowRight, Receipt } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import type { Statement } from "@/lib/services/tenant";

/** This month's bill at a glance, with a link to the itemised statement and payment instructions. */
export function StatementSummary({ statement }: { statement: Statement | undefined }) {
  return (
    <Card>
      <CardHeader icon={Receipt} title="Rent & bills" description={statement ? formatMonth(statement.billing_period_start) : "No statement yet"} action={statement ? <StatusBadge status={statement.status} /> : undefined} />
      {statement ? (
        <>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(statement.total_amount, statement.currency)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statement.status === "paid" ? "Paid in full. Thank you." : `Due ${formatDate(statement.due_date)}`}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border pt-4 text-sm">
            <dt className="text-muted-foreground">Rent</dt>
            <dd className="text-right tabular-nums">{formatMoney(statement.base_rent, statement.currency)}</dd>
            <dt className="text-muted-foreground">Water</dt>
            <dd className="text-right tabular-nums">{formatMoney(statement.water_bill, statement.currency)}</dd>
            <dt className="text-muted-foreground">Garbage</dt>
            <dd className="text-right tabular-nums">{formatMoney(statement.garbage_fee, statement.currency)}</dd>
            {statement.late_penalty > 0 ? (
              <>
                <dt className="text-muted-foreground">Penalty</dt>
                <dd className="text-right tabular-nums text-destructive">{formatMoney(statement.late_penalty, statement.currency)}</dd>
              </>
            ) : null}
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Your landlord issues a statement each month. It will appear here.</p>
      )}
      <Link href="/tenant/invoices" className={`${buttonVariants({ variant: "secondary", size: "sm" })} mt-5`}>
        {statement && statement.status !== "paid" ? "View statement & how to pay" : "View statements"}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}
