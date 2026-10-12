"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { initialFormState } from "@/types/forms";
import { commentOnTicketAction } from "./actions";

/** Tenant's reply on a ticket. Clears itself after a successful send. */
export function CommentForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState(commentOnTicketAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <Field label="Add a message" htmlFor="cm-message" error={state.fieldErrors?.message?.[0]}>
        <Textarea id="cm-message" name="message" rows={3} maxLength={4000} placeholder="Add more details or reply to your landlord…" />
      </Field>
      {state.status === "error" && state.message && !state.fieldErrors ? <Alert variant="error">{state.message}</Alert> : null}
      <Button type="submit" icon={Send} loading={pending} loadingText="Sending…">
        Send message
      </Button>
    </form>
  );
}
