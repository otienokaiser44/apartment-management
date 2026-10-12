"use client";

import { Save, User } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import type { AccountOverview } from "@/lib/services/account";
import { initialFormState } from "@/types/forms";
import { updateProfileAction } from "../actions";
import { AvatarUploader } from "./AvatarUploader";

/** Name, phone and picture, plus the few extra details that only one kind of account has. */
export function ProfileSection({ account }: { account: AccountOverview }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const label = account.fullName ?? account.email ?? "You";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={User} title="Profile picture" description="Shown next to your name in the header." />
        <AvatarUploader name={label} version={account.avatarPath} />
      </Card>

      <Card>
        <CardHeader icon={User} title="Personal details" description="How you appear to the people you work with." />
        <form action={action} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="pf-fullName" error={err("fullName")}>
              <Input id="pf-fullName" name="fullName" defaultValue={account.fullName ?? ""} autoComplete="name" aria-invalid={err("fullName") ? true : undefined} />
            </Field>
            <Field label="Phone" htmlFor="pf-phone" optional error={err("phone")} hint="Used for invitations and by your landlord or tenants to reach you.">
              <Input id="pf-phone" name="phone" type="tel" defaultValue={account.phone ?? ""} autoComplete="tel" placeholder="+254 700 000 000" aria-invalid={err("phone") ? true : undefined} />
            </Field>

            {account.role === "landlord" ? (
              <Field label="Business name" htmlFor="pf-businessName" optional error={err("businessName")} className="sm:col-span-2">
                <Input id="pf-businessName" name="businessName" defaultValue={account.businessName ?? ""} autoComplete="organization" />
              </Field>
            ) : null}

            {account.role === "tenant" ? (
              <>
                <Field label="Emergency contact name" htmlFor="pf-ecName" optional error={err("emergencyContactName")}>
                  <Input id="pf-ecName" name="emergencyContactName" defaultValue={account.emergencyContactName ?? ""} />
                </Field>
                <Field label="Emergency contact phone" htmlFor="pf-ecPhone" optional error={err("emergencyContactPhone")}>
                  <Input id="pf-ecPhone" name="emergencyContactPhone" type="tel" defaultValue={account.emergencyContactPhone ?? ""} />
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-2">Your emergency contact is private. Landlords cannot see it.</p>
              </>
            ) : null}
          </div>
          {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
          <Button type="submit" icon={Save} loading={pending} loadingText="Saving…">
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}
