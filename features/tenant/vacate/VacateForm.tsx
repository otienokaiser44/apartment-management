"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import { submitVacateAction } from "./actions";

/** The formal notice: a mandatory move-out date and reason, plus optional deposit refund details. */
export function VacateForm({ tenancyId, minDate, maxDate }: { tenancyId: string; minDate: string; maxDate: string }) {
  const [state, action, pending] = useActionState(submitVacateAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Intended move-out date" htmlFor="vc-date" error={err("moveOutDate")} hint="The day you will hand back the keys.">
          <Input id="vc-date" name="moveOutDate" type="date" min={minDate} max={maxDate} required aria-invalid={err("moveOutDate") ? true : undefined} />
        </Field>
        <Field label="Refund account details" htmlFor="vc-refund" optional error={err("refundDetails")} hint="Where to send your deposit refund, e.g. M-Pesa number or bank account.">
          <Input id="vc-refund" name="refundDetails" maxLength={500} autoComplete="off" placeholder="M-Pesa 07xx xxx xxx" />
        </Field>
      </div>
      <Field label="Reason for leaving" htmlFor="vc-reason" error={err("reason")}>
        <Textarea id="vc-reason" name="reason" rows={4} maxLength={2000} required aria-invalid={err("reason") ? true : undefined} />
      </Field>
      <div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-primary" />
          <span>
            I understand this is a formal notice to my landlord that I intend to vacate on the date above.
          </span>
        </label>
        {err("confirm") ? <p role="alert" className="mt-1.5 text-xs text-destructive">{err("confirm")}</p> : null}
      </div>
      {state.status === "error" && state.message && !state.fieldErrors ? <Alert variant="error">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert variant="success">{state.message}</Alert> : null}
      <Button type="submit" icon={LogOut} loading={pending} loadingText="Sending…">
        Submit move-out notice
      </Button>
    </form>
  );
}
