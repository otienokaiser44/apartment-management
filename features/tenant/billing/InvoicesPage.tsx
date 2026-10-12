import { Receipt } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import { requireRole } from "@/lib/auth/session";
import { getMyTenancies, getPaymentInfo, getStatements, getWaterDetail } from "@/lib/services/tenant";
import { PaymentInstructions } from "./PaymentInstructions";
import { StatementView } from "./StatementView";

const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Current statement (or a chosen past month), how to pay, and the statement history. */
export async function InvoicesPage({ invoiceId }: { invoiceId?: string }) {
  await requireRole("tenant");
  const tenancies = await getMyTenancies();
  const tenancy = tenancies.find((t) => t.tenancy_status === "active") ?? tenancies.find((t) => t.tenancy_status === "pending");

  if (!tenancy) {
    return (
      <>
        <PageHeader title="Invoices" description="Your monthly statements and payments." />
        <EmptyState
          icon={Receipt}
          title="No home linked yet"
          hint="Statements appear here once you have a tenancy."
          action={
            <Link href="/tenant" className={buttonVariants()}>
              Go to dashboard
            </Link>
          }
        />
      </>
    );
  }

  const statements = await getStatements(tenancy.tenancy_id, 24);
  const current = statements.find((s) => s.invoice_id === invoiceId) ?? statements[0];
  const [water, payInfo] = await Promise.all([
    current ? getWaterDetail(tenancy.tenancy_id, current.billing_period_start) : null,
    getPaymentInfo(tenancy.property_id),
  ]);
  const owing = current && (current.status === "unpaid" || current.status === "partial" || current.status === "overdue");

  return (
    <>
      <PageHeader title="Invoices" description={`${tenancy.property_name} · Unit ${tenancy.unit_number}`} />

      {!current ? (
        <EmptyState icon={Receipt} title="No invoices yet" hint="Your landlord issues a statement each month. It will show up here with rent, water and other charges." />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <StatementView statement={current} water={water} />
            <PaymentInstructions
              info={payInfo}
              unitNumber={tenancy.unit_number}
              landlordPhone={tenancy.landlord_phone}
              amountDue={owing ? formatMoney(current.total_amount, current.currency) : null}
            />
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Statement history</h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr>
                    <th className={th}>Month</th>
                    <th className={th}>Total</th>
                    <th className={th}>Due</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => (
                    <tr key={s.invoice_id} className={cn("border-b border-border/60 last:border-0", s.invoice_id === current.invoice_id && "bg-accent/40")}>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/tenant/invoices?invoice=${s.invoice_id}`} className="hover:underline">
                          {formatMonth(s.billing_period_start)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(s.total_amount, s.currency)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(s.due_date)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
