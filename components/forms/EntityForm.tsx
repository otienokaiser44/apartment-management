"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/types/forms";

export type FormFieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  hint?: string;
  step?: string;
  min?: number;
  options?: { value: string; label: string }[];
  /** Grid width on wide screens. */
  span?: 1 | 2;
};

export type CheckboxGroupDef = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  selected?: string[];
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: FormFieldDef[];
  values?: Record<string, string | number | null | undefined>;
  checkboxGroup?: CheckboxGroupDef;
  submitLabel: string;
  pendingLabel: string;
};

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/25";

/** Generic server-action form: renders fields, inline Zod errors and a pending submit. Used by landlord property/unit forms. */
export function EntityForm({ action, fields, values = {}, checkboxGroup, submitLabel, pendingLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `field-${f.name}`;
          const err = state.fieldErrors?.[f.name]?.[0];
          const common = {
            id,
            name: f.name,
            required: f.required,
            defaultValue: values[f.name] ?? "",
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? `${id}-error` : undefined,
            className: inputClass,
          } as const;
          return (
            <div key={f.name} className={f.span === 2 ? "sm:col-span-2" : undefined}>
              <label htmlFor={id} className="mb-1 block text-sm font-medium">
                {f.label}
                {f.required ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea {...common} rows={3} />
              ) : f.type === "select" ? (
                <select {...common}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} type={f.type} step={f.step} min={f.min} />
              )}
              {f.hint ? <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p> : null}
              {err ? (
                <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {checkboxGroup ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{checkboxGroup.label}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {checkboxGroup.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={checkboxGroup.name}
                  value={o.value}
                  defaultChecked={checkboxGroup.selected?.includes(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
