"use client";

import { Send, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ActionResult } from "./actions";
import {
  removeDocumentAction,
  startVerificationAction,
  submitVerificationAction,
  withdrawVerificationAction,
} from "./actions";

/** Runs a server action, refreshes on success and shows its message on failure. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) => {
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) router.refresh();
        else setError(r.message);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };
  return { pending, error, run };
}

function ActionButton({
  label,
  loadingText,
  icon,
  variant,
  disabled,
  action,
}: {
  label: string;
  loadingText: string;
  icon: typeof Send;
  variant?: ButtonVariant;
  disabled?: boolean;
  action: () => Promise<ActionResult>;
}) {
  const { pending, error, run } = useRun();
  return (
    <div className="space-y-2">
      <Button variant={variant} icon={icon} loading={pending} loadingText={loadingText} disabled={disabled} onClick={() => run(action)}>
        {label}
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}

export const StartButton = ({ propertyId, label }: { propertyId: string; label: string }) => (
  <ActionButton label={label} loadingText="Starting…" icon={ShieldCheck} action={() => startVerificationAction(propertyId)} />
);

export const SubmitButton = ({ propertyId, disabled }: { propertyId: string; disabled: boolean }) => (
  <ActionButton label="Submit for review" loadingText="Submitting…" icon={Send} disabled={disabled} action={() => submitVerificationAction(propertyId)} />
);

export const WithdrawButton = ({ propertyId, requestId, label = "Withdraw request" }: { propertyId: string; requestId: string; label?: string }) => (
  <ActionButton label={label} loadingText="Withdrawing…" icon={Undo2} variant="secondary" action={() => withdrawVerificationAction(propertyId, requestId)} />
);

export function RemoveDocumentButton({ propertyId, documentId, name }: { propertyId: string; documentId: string; name: string }) {
  const { pending, error, run } = useRun();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" icon={Trash2} loading={pending} aria-label={`Remove ${name}`} onClick={() => run(() => removeDocumentAction(propertyId, documentId))} />
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
