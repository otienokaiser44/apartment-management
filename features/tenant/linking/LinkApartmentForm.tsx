"use client";

import { useActionState } from "react";
import { initialFormState } from "@/types/forms";
import { requestUnitLinkAction } from "./actions";

const input =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";

export function LinkApartmentForm() {
  const [state, action, pending] = useActionState(requestUnitLinkAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3" noValidate>
      <div>
        <label htmlFor="req-code" className="mb-1 block text-sm font-medium">Property code</label>
        <input id="req-code" name="propertyCode" className={`${input} font-mono uppercase`} maxLength={8} autoComplete="off" />
        {err("propertyCode") ? <p className="mt-1 text-xs text-destructive">{err("propertyCode")}</p> : null}
      </div>
      <div>
        <label htmlFor="req-unit" className="mb-1 block text-sm font-medium">Unit number</label>
        <input id="req-unit" name="unitNumber" className={input} autoComplete="off" />
        {err("unitNumber") ? <p className="mt-1 text-xs text-destructive">{err("unitNumber")}</p> : null}
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
          {pending ? "Sending…" : "Request link"}
        </button>
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="req-msg" className="mb-1 block text-sm font-medium">
          Message <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id="req-msg" name="message" className={input} maxLength={1000} />
      </div>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`sm:col-span-3 text-sm ${state.status === "error" ? "text-destructive" : "text-success"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
