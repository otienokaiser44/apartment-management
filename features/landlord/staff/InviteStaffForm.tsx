"use client";

import { useActionState } from "react";
import { STAFF_ROLE_HELP, STAFF_ROLE_LABEL, STAFF_ROLES } from "@/lib/validation/staff";
import { inviteStaffAction, type InviteStaffState } from "./actions";

const input =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";
const initial: InviteStaffState = { status: "idle" };

/** Owner invites a manager or caretaker and chooses which properties they can access. */
export function InviteStaffForm({
  properties,
  preselectedId,
}: {
  properties: { id: string; name: string }[];
  preselectedId?: string;
}) {
  const [state, action, pending] = useActionState(inviteStaffAction, initial);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);

  if (properties.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a property first, then invite staff to it.</p>;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="st-email" className="mb-1 block text-sm font-medium">Their email</label>
          <input id="st-email" name="email" type="email" className={input} autoComplete="off" />
          {err("email") ? <p className="mt-1 text-xs text-destructive">{err("email")}</p> : null}
        </div>
        <div>
          <label htmlFor="st-role" className="mb-1 block text-sm font-medium">Role</label>
          <select id="st-role" name="role" className={input} defaultValue="property_manager">
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}
          </select>
          {err("role") ? <p className="mt-1 text-xs text-destructive">{err("role")}</p> : null}
        </div>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {STAFF_ROLES.map((r) => <li key={r}><strong>{STAFF_ROLE_LABEL[r]}:</strong> {STAFF_ROLE_HELP[r]}</li>)}
      </ul>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Properties they can access</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {properties.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="propertyIds" value={p.id} defaultChecked={p.id === preselectedId} />
              {p.name}
            </label>
          ))}
        </div>
        {err("propertyIds") ? <p className="mt-1 text-xs text-destructive">{err("propertyIds")}</p> : null}
      </fieldset>
      {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      {state.status === "created" ? (
        <div role="status" className="rounded-xl border border-border bg-card p-4 shadow-sm text-sm">
          <p className="font-medium">Invitation created for {state.email}.</p>
          <p className="mt-1 break-all text-xs">{state.inviteUrl}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown once. Send it to them; it expires in 7 days. They must sign up or log in as a manager with this exact email.
          </p>
        </div>
      ) : null}
      <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
        {pending ? "Creating…" : "Invite"}
      </button>
    </form>
  );
}
