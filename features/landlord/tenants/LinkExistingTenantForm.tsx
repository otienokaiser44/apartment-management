"use client";

import { useActionState } from "react";
import { initialFormState } from "@/types/forms";
import { linkExistingTenantAction } from "./actions";

const input =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";

/** Scenario C UI: pick a vacant unit and enter the registered tenant's email or phone. */
export function LinkExistingTenantForm({ propertyId, units }: { propertyId: string; units: { id: string; unit_number: string }[] }) {
  const [state, action, pending] = useActionState(linkExistingTenantAction.bind(null, propertyId), initialFormState);
  if (units.length === 0) {
    return <p className="text-sm text-muted-foreground">No vacant units to link.</p>;
  }
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4" noValidate>
      <div>
        <label htmlFor="link-unit" className="mb-1 block text-sm font-medium">Unit</label>
        <select id="link-unit" name="unitId" className={input} defaultValue="">
          <option value="" disabled>Choose…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.unit_number}</option>)}
        </select>
        {err("unitId") ? <p className="mt-1 text-xs text-destructive">{err("unitId")}</p> : null}
      </div>
      <div>
        <label htmlFor="link-email" className="mb-1 block text-sm font-medium">Tenant email</label>
        <input id="link-email" name="email" type="email" className={input} />
        {err("email") ? <p className="mt-1 text-xs text-destructive">{err("email")}</p> : null}
      </div>
      <div>
        <label htmlFor="link-phone" className="mb-1 block text-sm font-medium">or phone</label>
        <input id="link-phone" name="phone" type="tel" className={input} />
        {err("phone") ? <p className="mt-1 text-xs text-destructive">{err("phone")}</p> : null}
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
          {pending ? "Sending…" : "Send link request"}
        </button>
      </div>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={`sm:col-span-4 text-sm ${state.status === "error" ? "text-destructive" : "text-success"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
