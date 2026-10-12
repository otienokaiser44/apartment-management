"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, InputGroup, Textarea } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import type { BillingSettings } from "@/lib/services/billing";
import { saveBillingSettingsAction } from "./actions";

/** Property-level billing configuration: fees, water rate, late penalty, rent due day and how tenants pay. */
export function SettingsForm({ propertyId, settings, currency }: { propertyId: string; settings: BillingSettings; currency: string }) {
  const [state, action, pending] = useActionState(saveBillingSettingsAction.bind(null, propertyId), initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Garbage fee / month" htmlFor="bs-defaultGarbageFee" hint="Added to every invoice." error={err("defaultGarbageFee")}>
          <InputGroup id="bs-defaultGarbageFee" name="defaultGarbageFee" type="number" step="0.01" min={0} defaultValue={Number(settings.default_garbage_fee)} prefix={currency} />
        </Field>
        <Field label="Water rate" htmlFor="bs-waterRatePerUnit" hint="Charged per unit consumed." error={err("waterRatePerUnit")}>
          <InputGroup id="bs-waterRatePerUnit" name="waterRatePerUnit" type="number" step="0.0001" min={0} defaultValue={Number(settings.water_rate_per_unit)} prefix={currency} suffix="per m³" />
        </Field>
        <Field label="Late penalty" htmlFor="bs-latePenaltyPercentage" hint="On balances unpaid after their due date." error={err("latePenaltyPercentage")}>
          <InputGroup id="bs-latePenaltyPercentage" name="latePenaltyPercentage" type="number" step="0.01" min={0} max={100} defaultValue={Number(settings.late_penalty_percentage)} suffix="%" />
        </Field>
        <Field label="Rent due day" htmlFor="bs-rentDueDay" hint="Day of the month (1 to 28)." error={err("rentDueDay")}>
          <InputGroup id="bs-rentDueDay" name="rentDueDay" type="number" step="1" min={1} max={28} defaultValue={settings.rent_due_day} prefix="Day" />
        </Field>
      </div>

      <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
        <Field label="M-Pesa Paybill" htmlFor="bs-mpesaPaybill" optional hint="Shown to tenants on their statement." error={err("mpesaPaybill")}>
          <InputGroup id="bs-mpesaPaybill" name="mpesaPaybill" inputMode="numeric" maxLength={7} defaultValue={settings.mpesa_paybill ?? ""} prefix="Paybill" placeholder="123456" />
        </Field>
        <Field label="Payment instructions" htmlFor="bs-paymentInstructions" optional hint="e.g. the account number format, or other ways to pay." error={err("paymentInstructions")} className="sm:col-span-2">
          <Textarea id="bs-paymentInstructions" name="paymentInstructions" rows={3} maxLength={1000} defaultValue={settings.payment_instructions ?? ""} />
        </Field>
      </div>

      {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
      <Button type="submit" icon={Save} loading={pending} loadingText="Saving…">
        Save settings
      </Button>
    </form>
  );
}
