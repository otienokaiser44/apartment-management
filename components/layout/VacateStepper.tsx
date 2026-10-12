import { Stepper, type Step } from "@/components/layout/Stepper";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { VacateNoticeRow } from "@/lib/services/moveouts";

/** Builds the four-step tracker: steps before `done` are complete, the next one is current, the rest are upcoming. */
export function vacateSteps(n: VacateNoticeRow, currency: string, viewer: "tenant" | "staff"): Step[] {
  const done = { submitted: 1, approved: 2, inspection_pending: 2, deposit_refunded: 4, withdrawn: 0 }[n.status];
  const state = (i: number): Step["state"] => (i < done ? "done" : i === done ? "current" : "todo");
  const waiting = viewer === "tenant" ? "Waiting for your landlord" : "Waiting for you";
  return [
    { key: "submitted", label: "Notice submitted", detail: formatDate(n.created_at), state: state(0) },
    { key: "acknowledged", label: viewer === "tenant" ? "Landlord acknowledged" : "Acknowledged", detail: n.acknowledged_at ? formatDate(n.acknowledged_at) : waiting, state: state(1) },
    {
      key: "inspection",
      label: "Move-out inspection",
      detail: n.inspection_at ? formatDateTime(n.inspection_at) : done >= 2 ? "To be scheduled" : undefined,
      state: state(2),
    },
    {
      key: "refund",
      label: "Deposit refunded",
      detail:
        n.status === "deposit_refunded"
          ? `${formatMoney(n.refund_amount, currency)} on ${formatDate(n.refunded_at)}`
          : `Deposit held: ${formatMoney(n.deposit_held, currency)}`,
      state: state(3),
    },
  ];
}

/** Acknowledgement -> inspection -> deposit refund, as a progress tracker. Shared by tenants and staff. */
export function VacateStepper({ notice, currency, viewer }: { notice: VacateNoticeRow; currency: string; viewer: "tenant" | "staff" }) {
  return <Stepper steps={vacateSteps(notice, currency, viewer)} />;
}
