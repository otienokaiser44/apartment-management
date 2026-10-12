"use client";

import { useActionState } from "react";
import { initialFormState } from "@/types/forms";
import { acceptStaffInviteAction } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptStaffInviteAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
        {pending ? "Accepting…" : "Accept invitation"}
      </button>
    </form>
  );
}
