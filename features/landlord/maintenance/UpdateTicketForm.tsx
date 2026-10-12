"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { NEXT_TICKET_STATUSES, TICKET_STATUS_LABEL, type MaintenanceStatus } from "@/lib/validation/portal";
import { initialFormState } from "@/types/forms";
import { updateTicketAction } from "./actions";

/** Change the status and/or tell the tenant what is happening. Only legal next statuses are offered. */
export function UpdateTicketForm({ ticketId, status }: { ticketId: string; status: MaintenanceStatus }) {
  const [state, action, pending] = useActionState(updateTicketAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);
  const next = NEXT_TICKET_STATUSES[status];

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-4" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      {next.length > 0 ? (
        <Field label="Status" htmlFor="ut-status" error={state.fieldErrors?.status?.[0]}>
          <Select id="ut-status" name="status" defaultValue="">
            <option value="">Keep as {TICKET_STATUS_LABEL[status]}</option>
            {next.map((s) => (
              <option key={s} value={s}>
                Change to {TICKET_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Message to the tenant" htmlFor="ut-message" optional={next.length > 0} error={state.fieldErrors?.message?.[0]} hint="They are notified of every update.">
        <Textarea id="ut-message" name="message" rows={3} maxLength={4000} placeholder="e.g. Plumber booked for Thursday morning." />
      </Field>
      {state.message && !state.fieldErrors ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
      <Button type="submit" icon={Send} loading={pending} loadingText="Posting…">
        Post update
      </Button>
    </form>
  );
}
