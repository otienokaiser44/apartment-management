"use client";

import { Download, ShieldAlert } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import { deactivateAccountAction } from "../actions";

export function PrivacySection({ role }: { role: string }) {
  const [state, action, pending] = useActionState(deactivateAccountAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={Download} title="Download your data" description="A copy of the information we hold about you, as a JSON file." />
        <a href="/account/export" download className={buttonVariants({ variant: "secondary" })}>
          <Download className="size-4" aria-hidden />
          Download my data
        </a>
        <p className="mt-3 text-xs text-muted-foreground">Includes your profile, preferences, notifications, tenancies, payments and requests that you can see.</p>
      </Card>

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <CardHeader icon={ShieldAlert} title="Deactivate account" description="Close your account and sign out everywhere." />
        {role === "admin" ? (
          <p className="text-sm text-muted-foreground">Administrator accounts cannot be deactivated from settings.</p>
        ) : (
          <form action={action} className="max-w-md space-y-4" noValidate>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>You will be signed out on every device and cannot log in again until support reactivates the account.</li>
              <li>Your pending invitations and requests are cancelled. Tenancy and payment history is kept.</li>
              <li>You cannot deactivate while you have an active or pending tenancy, as a tenant or as an owner.</li>
              <li>To have your data permanently erased, contact support after deactivating.</li>
            </ul>
            <Field label="Your password" htmlFor="dz-password" error={err("password")}>
              <Input id="dz-password" name="password" type="password" autoComplete="current-password" aria-invalid={err("password") ? true : undefined} />
            </Field>
            <Field label="Type DEACTIVATE to confirm" htmlFor="dz-confirm" error={err("confirmation")}>
              <Input id="dz-confirm" name="confirmation" autoComplete="off" placeholder="DEACTIVATE" aria-invalid={err("confirmation") ? true : undefined} />
            </Field>
            {state.status === "error" && state.message ? <Alert variant="error">{state.message}</Alert> : null}
            <Button type="submit" variant="destructive" loading={pending} loadingText="Deactivating…">
              Deactivate my account
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
