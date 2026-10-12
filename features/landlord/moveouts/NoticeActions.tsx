"use client";

import { CalendarClock, CheckCheck, HandCoins } from "lucide-react";
import { useActionState } from "react";
import { ActionButton } from "@/components/forms/ActionButton";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, InputGroup, Textarea } from "@/components/ui/field";
import type { StaffVacateRow } from "@/lib/services/moveouts";
import { initialFormState } from "@/types/forms";
import { acknowledgeVacateAction, endTenancyAction, recordRefundAction, scheduleInspectionAction } from "./actions";

function Result({ state }: { state: { status: string; message?: string; fieldErrors?: unknown } }) {
  if (!state.message || state.fieldErrors) return null;
  return <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

function AcknowledgeForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(acknowledgeVacateAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="noticeId" value={id} />
      <Field label="Note to the tenant" htmlFor={`ack-${id}`} optional>
        <Textarea id={`ack-${id}`} name="note" rows={2} maxLength={2000} placeholder="e.g. Please return the keys to the caretaker." />
      </Field>
      <Result state={state} />
      <Button type="submit" icon={CheckCheck} loading={pending} loadingText="Saving…">
        Acknowledge notice
      </Button>
    </form>
  );
}

function InspectionForm({ id, minLocal }: { id: string; minLocal: string }) {
  const [state, action, pending] = useActionState(scheduleInspectionAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="noticeId" value={id} />
      <Field label="Inspection date and time (Nairobi)" htmlFor={`insp-${id}`} error={state.fieldErrors?.inspectionAt?.[0]}>
        <Input id={`insp-${id}`} name="inspectionAt" type="datetime-local" min={minLocal} required aria-invalid={state.fieldErrors?.inspectionAt ? true : undefined} />
      </Field>
      <Field label="Note" htmlFor={`insp-note-${id}`} optional>
        <Textarea id={`insp-note-${id}`} name="note" rows={2} maxLength={2000} placeholder="What the tenant should prepare." />
      </Field>
      <Result state={state} />
      <Button type="submit" icon={CalendarClock} loading={pending} loadingText="Scheduling…">
        Schedule inspection
      </Button>
    </form>
  );
}

function RefundForm({ id, currency, deposit }: { id: string; currency: string; deposit: number }) {
  const [state, action, pending] = useActionState(recordRefundAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="noticeId" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Refund amount" htmlFor={`rf-${id}`} error={err("refundAmount")} hint={`Deposit held: ${currency} ${deposit.toLocaleString()}`}>
          <InputGroup id={`rf-${id}`} name="refundAmount" type="number" step="0.01" min={0} prefix={currency} required />
        </Field>
        <Field label="Deductions" htmlFor={`rd-${id}`} optional error={err("deductions")}>
          <InputGroup id={`rd-${id}`} name="deductions" type="number" step="0.01" min={0} prefix={currency} />
        </Field>
      </div>
      <Field label="Note" htmlFor={`rn-${id}`} optional hint="Required when you deduct anything: explain what the deduction covers.">
        <Textarea id={`rn-${id}`} name="note" rows={2} maxLength={2000} />
      </Field>
      <Result state={state} />
      <Button type="submit" icon={HandCoins} loading={pending} loadingText="Saving…">
        Record deposit refund
      </Button>
    </form>
  );
}

/** The next step for a notice, by status. Finished notices offer to end the tenancy. */
export function NoticeActions({ notice, minLocal }: { notice: StaffVacateRow; minLocal: string }) {
  switch (notice.status) {
    case "submitted":
      return <AcknowledgeForm id={notice.id} />;
    case "approved":
      return <InspectionForm id={notice.id} minLocal={minLocal} />;
    case "inspection_pending":
      return <RefundForm id={notice.id} currency={notice.currency} deposit={notice.deposit_held} />;
    case "deposit_refunded":
      return notice.tenancy_status === "active" ? (
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton variant="primary" label="End tenancy" confirm="End this tenancy now? The unit becomes vacant. Payment and tenancy history is kept." action={endTenancyAction.bind(null, notice.tenancy_id)} />
          <p className="text-xs text-muted-foreground">Do this once the tenant has handed back the keys.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">The tenancy has ended.</p>
      );
    default:
      return null;
  }
}
