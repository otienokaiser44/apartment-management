import { ActionButton } from "@/components/forms/ActionButton";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { VacateStepper } from "@/components/layout/VacateStepper";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { VacateNoticeRow } from "@/lib/services/moveouts";
import { VACATE_STATUS_LABEL } from "@/lib/validation/portal";
import { withdrawVacateAction } from "./actions";

export function VacateTracker({ notice, currency }: { notice: VacateNoticeRow; currency: string }) {
  const canWithdraw = notice.status === "submitted" || notice.status === "approved";
  return (
    <Card>
      <CardHeader
        title="Your move-out notice"
        description={`Moving out on ${formatDate(notice.intended_move_out_date)}`}
        action={<StatusBadge status={notice.status} label={VACATE_STATUS_LABEL[notice.status]} />}
      />
      <VacateStepper notice={notice} currency={currency} viewer="tenant" />

      <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Your reason</dt>
          <dd className="mt-1 whitespace-pre-wrap">{notice.reason}</dd>
        </div>
        {notice.refund_account_details ? (
          <div>
            <dt className="text-xs text-muted-foreground">Refund account</dt>
            <dd className="mt-1">{notice.refund_account_details}</dd>
          </div>
        ) : null}
        {notice.landlord_notes ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Note from your landlord</dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2">{notice.landlord_notes}</dd>
          </div>
        ) : null}
        {notice.status === "deposit_refunded" ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Deposit settlement</dt>
            <dd className="mt-1">
              Refunded {formatMoney(notice.refund_amount, currency)}
              {notice.deductions ? `, deductions ${formatMoney(notice.deductions, currency)}` : ""} of a {formatMoney(notice.deposit_held, currency)} deposit.
            </dd>
          </div>
        ) : null}
      </dl>

      {canWithdraw ? (
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          <ActionButton label="Withdraw notice" confirm="Withdraw your move-out notice?" action={withdrawVacateAction.bind(null, notice.id)} />
          <p className="text-xs text-muted-foreground">You can withdraw until the inspection is scheduled.</p>
        </div>
      ) : null}
    </Card>
  );
}
