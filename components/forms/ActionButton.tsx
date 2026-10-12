"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

type Props = {
  /** Server action wrapped with its arguments. `ok: false` shows `message` as an error; `ok: true` may show a success note. */
  action: () => Promise<{ ok: boolean; message?: string }>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  confirm?: string;
};

/** One-click server action with spinner while pending and an inline result. For accept/reject/approve style buttons. */
export function ActionButton({ action, label, pendingLabel, variant = "secondary", confirm }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={variant}
        loading={pending}
        loadingText={pendingLabel ?? "Working…"}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setResult(null);
          start(async () => {
            try {
              const res = await action();
              if (!res.ok) setResult({ ok: false, text: res.message ?? "Something went wrong." });
              else if (res.message) setResult({ ok: true, text: res.message });
            } catch {
              setResult({ ok: false, text: "Something went wrong. Please try again." });
            }
          });
        }}
      >
        {label}
      </Button>
      {result ? (
        <span role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-success" : "text-destructive"}`}>
          {result.text}
        </span>
      ) : null}
    </span>
  );
}
