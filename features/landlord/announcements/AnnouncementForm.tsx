"use client";

import { Send } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { NOTICE_CATEGORIES, NOTICE_CATEGORY_LABEL } from "@/lib/validation/portal";
import { initialFormState } from "@/types/forms";
import { sendAnnouncementAction } from "./actions";

const AUDIENCES = [
  { value: "all", label: "All tenants" },
  { value: "floor", label: "A specific floor" },
  { value: "unit", label: "A specific unit" },
  { value: "unpaid_only", label: "Tenants with unpaid invoices" },
] as const;

export function AnnouncementForm({ propertyId, units }: { propertyId: string; units: { id: string; unit_number: string }[] }) {
  const [state, action, pending] = useActionState(sendAnnouncementAction.bind(null, propertyId), initialFormState);
  const [audience, setAudience] = useState<string>("all");
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="an-title" error={err("title")} className="sm:col-span-2">
          <Input id="an-title" name="title" maxLength={150} aria-invalid={err("title") ? true : undefined} />
        </Field>
        <Field label="Message" htmlFor="an-msg" error={err("message")} className="sm:col-span-2">
          <Textarea id="an-msg" name="message" rows={4} maxLength={5000} aria-invalid={err("message") ? true : undefined} />
        </Field>
        <Field label="Category" htmlFor="an-cat" error={err("category")} hint="Urgent alerts are highlighted on tenants' dashboards.">
          <Select id="an-cat" name="category" defaultValue="general">
            {NOTICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NOTICE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Send to" htmlFor="an-aud" error={err("audience")}>
          <Select id="an-aud" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        {audience === "floor" ? (
          <Field label="Floor number" htmlFor="an-floor" error={err("value")}>
            <Input id="an-floor" name="value" type="number" />
          </Field>
        ) : null}
        {audience === "unit" ? (
          <Field label="Unit" htmlFor="an-unit" error={err("value")}>
            <Select id="an-unit" name="value" defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_number}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      {state.message && !state.fieldErrors ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
      <Button type="submit" icon={Send} loading={pending} loadingText="Sending…">
        Send announcement
      </Button>
    </form>
  );
}
