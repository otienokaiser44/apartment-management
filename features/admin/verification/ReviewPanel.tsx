"use client";

import { Check, PlayCircle, X } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import { reviewAction } from "./actions";

/** Decision form. Each button submits its own `decision`; the server action validates and calls the review function. */
export function ReviewPanel({ requestId, status, missingRequired }: { requestId: string; status: string; missingRequired: string[] }) {
  const [state, action, pending] = useActionState(reviewAction, initialFormState);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <h2 className="text-lg font-semibold">Decision</h2>
        <p className="text-sm text-muted-foreground">Approving makes the property verified. A rejection needs a reason; the landlord sees it.</p>
      </div>

      {missingRequired.length ? <Alert variant="error">Missing required documents: {missingRequired.join(", ")}.</Alert> : null}

      <Field label="Note to landlord" htmlFor="rv-reason" optional hint="Required when rejecting." error={err("reason")}>
        <Textarea id="rv-reason" name="reason" rows={3} maxLength={1000} aria-invalid={err("reason") ? true : undefined} />
      </Field>

      {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {status === "submitted" ? (
          <Button type="submit" name="decision" value="under_review" variant="secondary" icon={PlayCircle} disabled={pending}>
            Start review
          </Button>
        ) : null}
        <Button type="submit" name="decision" value="approved" icon={Check} disabled={pending}>
          Approve
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="destructive" icon={X} disabled={pending}>
          Reject
        </Button>
      </div>
    </form>
  );
}
