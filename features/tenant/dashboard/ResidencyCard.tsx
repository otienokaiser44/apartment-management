import { Building2 } from "lucide-react";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { MyTenancy } from "@/lib/services/tenant";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

/** The tenant's current home: property, unit, floor, lease dates and rent. */
export function ResidencyCard({ tenancy }: { tenancy: MyTenancy }) {
  const address = [tenancy.address_line_1, tenancy.city].filter(Boolean).join(", ");
  return (
    <Card>
      <CardHeader
        icon={Building2}
        title={tenancy.property_name}
        description={address || undefined}
        action={<StatusBadge status={tenancy.tenancy_status === "active" ? "active" : tenancy.tenancy_status} label="Active residency" />}
      />
      <dl className="grid gap-5 sm:grid-cols-3">
        <Fact label="Unit">
          {tenancy.unit_number}
          {tenancy.unit_type ? <span className="block text-xs font-normal text-muted-foreground">{tenancy.unit_type}</span> : null}
        </Fact>
        <Fact label="Floor">{tenancy.floor_number !== null ? tenancy.floor_number : "—"}</Fact>
        <Fact label="Base rent">
          {formatMoney(tenancy.monthly_rent, tenancy.currency)}
          <span className="block text-xs font-normal text-muted-foreground">per month</span>
        </Fact>
        <Fact label="Lease start">{formatDate(tenancy.start_date)}</Fact>
        <Fact label="Lease end">{tenancy.end_date ? formatDate(tenancy.end_date) : <span className="text-muted-foreground">Open-ended</span>}</Fact>
        <Fact label="Security deposit">{formatMoney(tenancy.security_deposit, tenancy.currency)}</Fact>
      </dl>
    </Card>
  );
}
