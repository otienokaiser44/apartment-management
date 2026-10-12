import { ArrowLeft, Calendar, Droplets, Receipt, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { getBillingSettings, getMeterRows, listInvoices } from "@/lib/services/billing";
import { listUnits } from "@/lib/services/properties";
import { monthOf, monthToPeriod } from "@/lib/validation/billing";
import { GenerateInvoicesPanel } from "./GenerateInvoicesPanel";
import { InvoicesTable } from "./InvoicesTable";
import { MeterReadingsGrid } from "./MeterReadingsGrid";
import { SettingsForm } from "./SettingsForm";

/** Billing & utilities for one property: settings, monthly meter readings, invoice generation and the ledger. */
export async function BillingTab({ propertyId, month, unitId, isOwner }: { propertyId: string; month?: string; unitId?: string; isOwner: boolean }) {
  const selected = monthToPeriod(month) ? (month as string) : monthOf(new Date());
  const period = monthToPeriod(selected) as string;
  const base = `/landlord/properties/${propertyId}`;

  const [settings, units] = await Promise.all([getBillingSettings(propertyId), listUnits(propertyId)]);
  if (!settings) return <p className="text-sm text-muted-foreground">Billing settings are unavailable for this property.</p>;

  const unit = unitId ? units.find((u) => u.id === unitId) : undefined;
  const currency = units[0]?.currency ?? "KES";

  // Ledger view for one unit (from the unit row action), otherwise the selected month's workflow.
  if (unit) {
    const ledger = await listInvoices(propertyId, { unitId: unit.id });
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ledger: unit {unit.unit_number}</h2>
          <Link href={`${base}?tab=billing`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to billing
          </Link>
        </div>
        <InvoicesTable invoices={ledger} showPeriod />
        <p className="text-xs text-muted-foreground">
          &ldquo;Previous&rdquo; is the unpaid balance of older invoices carried into the total. Record payments against each month&apos;s invoice.
        </p>
      </div>
    );
  }

  const [meterRows, invoices] = await Promise.all([getMeterRows(propertyId, period), listInvoices(propertyId, { period })]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Settings2} title="Billing settings" description="Rates and fees applied to every invoice for this property." />
        {isOwner ? (
          <SettingsForm propertyId={propertyId} settings={settings} currency={currency} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Garbage fee {currency} {Number(settings.default_garbage_fee)} · water {currency} {Number(settings.water_rate_per_unit)} per m³ · late penalty{" "}
            {Number(settings.late_penalty_percentage)}% · rent due on day {settings.rent_due_day}. Only the owner can change these.
          </p>
        )}
      </Card>

      <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="billing" />
        <div>
          <label htmlFor="bill-month" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="size-4 text-muted-foreground" aria-hidden />
            Billing month
          </label>
          <Input id="bill-month" type="month" name="month" defaultValue={selected} className="w-48" />
        </div>
        <Button type="submit" variant="secondary">
          Go
        </Button>
      </form>

      <Card>
        <CardHeader
          icon={Droplets}
          title="Water meter readings"
          description={`Rate: ${currency} ${Number(settings.water_rate_per_unit)} per m³. Water bill = units used × rate.`}
        />
        <MeterReadingsGrid
          propertyId={propertyId}
          month={selected}
          rate={Number(settings.water_rate_per_unit)}
          currency={currency}
          rows={meterRows}
        />
      </Card>

      <Card>
        <CardHeader icon={Sparkles} title="Generate invoices" description="One consolidated invoice per active tenant: rent, water, garbage and penalties." />
        <GenerateInvoicesPanel propertyId={propertyId} month={selected} />
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Invoices for {selected}</h2>
        </div>
        <InvoicesTable invoices={invoices} />
      </section>
    </div>
  );
}
