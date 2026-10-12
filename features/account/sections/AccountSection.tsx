"use client";

import { AtSign, Mail } from "lucide-react";
import { useActionState } from "react";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import type { AccountOverview } from "@/lib/services/account";
import { initialFormState } from "@/types/forms";
import { changeEmailAction } from "../actions";

const ROLE_LABEL: Record<string, string> = {
  tenant: "Tenant",
  landlord: "Landlord",
  manager: "Property manager / caretaker",
  admin: "Administrator",
};

/** Sign-in email (changeable, with confirmation) and read-only account facts. */
export function AccountSection({ account }: { account: AccountOverview }) {
  const [state, action, pending] = useActionState(changeEmailAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={AtSign} title="Email address" description="This is what you sign in with and where we send important messages." />
        <p className="mb-4 text-sm">
          Current email: <strong>{account.email ?? "—"}</strong>
        </p>
        {account.pendingEmail ? (
          <Alert variant="info" className="mb-4">
            Waiting for you to confirm <strong>{account.pendingEmail}</strong>. Open the link we emailed to finish the change.
          </Alert>
        ) : null}
        <form action={action} className="space-y-4" noValidate>
          <Field label="New email address" htmlFor="ac-email" error={err("email")} hint="We will email a confirmation link. Your email only changes after you confirm it.">
            <Input id="ac-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={err("email") ? true : undefined} />
          </Field>
          {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
          <Button type="submit" icon={Mail} loading={pending} loadingText="Sending…">
            Send confirmation
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Account" description="Details about your account. Contact support if any of this is wrong." />
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Account type</dt>
            <dd className="mt-1 font-medium">{ROLE_LABEL[account.role] ?? account.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={account.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="mt-1 font-medium">{account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
