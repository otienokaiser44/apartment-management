"use client";

import { Eye, EyeOff, KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import { useActionState, useState } from "react";
import { ActionButton } from "@/components/forms/ActionButton";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, InputGroup } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import { changePasswordAction, signOutEverywhereAction, signOutOthersAction } from "../actions";

/** A password input with a show/hide toggle. */
function PasswordInput({ id, name, autoComplete, invalid }: { id: string; name: string; autoComplete: string; invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup
      id={id}
      name={name}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      aria-invalid={invalid ? true : undefined}
      suffix={
        <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} className="-mx-1 px-1 hover:text-foreground">
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      }
    />
  );
}

export function SecuritySection() {
  const [state, action, pending] = useActionState(changePasswordAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={KeyRound} title="Change password" description="Use a long password you do not use anywhere else." />
        <form action={action} className="max-w-md space-y-4" noValidate>
          <Field label="Current password" htmlFor="pw-current" error={err("currentPassword")}>
            <PasswordInput id="pw-current" name="currentPassword" autoComplete="current-password" invalid={!!err("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={err("newPassword")} hint="At least 8 characters, with a letter and a number.">
            <PasswordInput id="pw-new" name="newPassword" autoComplete="new-password" invalid={!!err("newPassword")} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={err("confirmPassword")}>
            <PasswordInput id="pw-confirm" name="confirmPassword" autoComplete="new-password" invalid={!!err("confirmPassword")} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="signOutOthers" defaultChecked className="mt-0.5 size-4 accent-primary" />
            <span>
              Sign out my other devices
              <span className="block text-xs text-muted-foreground">Recommended if you think someone else had your password.</span>
            </span>
          </label>
          {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
          <Button type="submit" icon={KeyRound} loading={pending} loadingText="Updating…">
            Update password
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader icon={MonitorSmartphone} title="Devices & sessions" description="You stay signed in on each device until you sign out or change your password." />
        <div className="flex flex-wrap gap-3">
          <ActionButton label="Sign out other devices" confirm="Sign out everywhere except this device?" action={signOutOthersAction} />
          <ActionButton label="Sign out everywhere" confirm="Sign out on all devices, including this one?" action={signOutEverywhereAction} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <LogOut className="size-3.5" aria-hidden />
          Signing out everywhere ends every session, including this one.
        </p>
      </Card>
    </div>
  );
}
