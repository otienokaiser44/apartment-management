"use client";

import { useActionState } from "react";
import { inviteOneAction, type InviteOneState } from "./inviteActions";

const input =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";

const initial: InviteOneState = { status: "idle" };

/** Single-unit invitation. The tenant claims the unit by opening the link while signed in with the invited email/phone. */
export function InviteTenantForm({ units, selectedUnitId }: { units: { id: string; unit_number: string }[]; selectedUnitId?: string }) {
  const [state, action, pending] = useActionState(inviteOneAction, initial);
  if (units.length === 0) return <p className="text-sm text-muted-foreground">No vacant units to assign.</p>;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4" noValidate>
      <div>
        <label htmlFor="inv-unit" className="mb-1 block text-sm font-medium">Unit</label>
        <select id="inv-unit" name="unitId" className={input} defaultValue={selectedUnitId ?? ""}>
          <option value="" disabled>Choose…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="inv-email" className="mb-1 block text-sm font-medium">Tenant email</label>
        <input id="inv-email" name="email" type="email" className={input} />
      </div>
      <div>
        <label htmlFor="inv-phone" className="mb-1 block text-sm font-medium">or phone</label>
        <input id="inv-phone" name="phone" type="tel" className={input} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
          {pending ? "Creating…" : "Create invite link"}
        </button>
      </div>
      {state.status === "error" ? <p role="alert" className="text-sm text-destructive sm:col-span-4">{state.message}</p> : null}
      {state.status === "created" ? (
        <div role="status" className="rounded-xl border border-border bg-card p-4 shadow-sm text-sm sm:col-span-4">
          <p className="font-medium">Invitation created for {state.email ?? state.phone}.</p>
          <p className="mt-1 break-all text-xs">{state.claimUrl}</p>
          <p className="mt-1 text-xs text-muted-foreground">Shown once. Share it with the tenant; it expires in 7 days.</p>
        </div>
      ) : null}
    </form>
  );
}
