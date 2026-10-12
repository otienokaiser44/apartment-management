"use client";

import { useActionState, useState } from "react";
import { initialAuthFormState, type AuthFormState } from "@/types/auth";

export type AuthField = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "password";
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

type Props = {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: AuthField[];
  submitLabel: string;
  pendingLabel: string;
  /** Extra non-secret values posted with the form (e.g. the sanitized `next` path). */
  hidden?: Record<string, string>;
};

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";

function Field({ field, errors }: { field: AuthField; errors?: string[] }) {
  const [visible, setVisible] = useState(false);
  const isPassword = field.type === "password";
  const id = `field-${field.name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {field.label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={field.name}
          type={isPassword && visible ? "text" : field.type}
          autoComplete={field.autoComplete}
          required={field.required ?? true}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? `${id}-error` : undefined}
          className={isPassword ? `${inputClass} pr-16` : inputClass}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="absolute inset-y-0 right-2 text-xs text-muted-foreground hover:underline"
          >
            {visible ? "Hide" : "Show"}
          </button>
        ) : null}
      </div>
      {field.hint ? <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p> : null}
      {errors?.length ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

/** Shared email/password form shell for every auth page. Role features supply copy, fields and the server action. */
export function AuthForm({ action, fields, submitLabel, pendingLabel, hidden }: Props) {
  const [state, formAction, pending] = useActionState(action, initialAuthFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state.status !== "idle" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-lg bg-success/10 px-3 py-2 text-sm text-success"
          }
        >
          {state.message}
        </p>
      ) : null}
      {fields.map((field) => (
        <Field key={field.name} field={field} errors={state.fieldErrors?.[field.name]} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
