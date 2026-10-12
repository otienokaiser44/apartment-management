import { Receipt } from "lucide-react";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import type { Statement, WaterDetail } from "@/lib/services/tenant";

const row = "flex items-start justify-between gap-4 py-3 text-sm";
// Amounts never wrap ("KES" / "180" on two lines); the label column gives way instead.
const amount = "shrink-0 whitespace-nowrap font-medium tabular-nums";

/** One itemised monthly statement: rent + water + garbage + penalties (+ anything brought forward). */
export function StatementView({ statement, water }: { statement: Statement; water: WaterDetail | null }) {
  const c = statement.currency;
  const waterNote =
    water && water.units_consumed > 0
      ? `${water.units_consumed} m³ × ${formatMoney(water.rate_per_unit, c)} (meter ${water.previous_reading} → ${water.current_reading})`
      : water
        ? "No consumption recorded"
        : null;

  return (
    <Card>
      <CardHeader
        icon={Receipt}
        title={`Statement for ${formatMonth(statement.billing_period_start)}`}
        description={`Due ${formatDate(statement.due_date)}`}
        action={<StatusBadge status={statement.status} />}
      />
      <dl className="divide-y divide-border">
        <div className={row}>
          <dt>Base rent</dt>
          <dd className={amount}>{formatMoney(statement.base_rent, c)}</dd>
        </div>
        <div className={row}>
          <dt>
            Water
            {waterNote ? <span className="block text-xs text-muted-foreground">{waterNote}</span> : null}
          </dt>
          <dd className={amount}>{formatMoney(statement.water_bill, c)}</dd>
        </div>
        <div className={row}>
          <dt>Garbage fee</dt>
          <dd className={amount}>{formatMoney(statement.garbage_fee, c)}</dd>
        </div>
        <div className={row}>
          <dt>
            Late penalty
            {statement.late_penalty > 0 ? <span className="block text-xs text-muted-foreground">On an overdue balance from an earlier month</span> : null}
          </dt>
          <dd className={`${amount} ${statement.late_penalty > 0 ? "text-destructive" : ""}`}>{formatMoney(statement.late_penalty, c)}</dd>
        </div>
        {statement.previous_balance > 0 ? (
          <div className={row}>
            <dt>
              Balance brought forward
              <span className="block text-xs text-muted-foreground">Unpaid from earlier months</span>
            </dt>
            <dd className={amount}>{formatMoney(statement.previous_balance, c)}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 pt-4">
          <dt className="font-semibold">Total due</dt>
          <dd className="shrink-0 whitespace-nowrap text-2xl font-semibold tabular-nums">{formatMoney(statement.total_amount, c)}</dd>
        </div>
      </dl>
    </Card>
  );
}
