"use client";

import { Paperclip, Plus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_MAX_BYTES, CATEGORY_LABEL, MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAX_ATTACHMENTS, PRIORITY_LABEL,
  sniffAttachmentType,
} from "@/lib/validation/portal";
import { initialFormState } from "@/types/forms";
import { submitTicketAction, type TicketFormState } from "./actions";

const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/**
 * Uploads straight from the browser to the private bucket (so large photos never pass through a server action).
 * Each file is identified by its content, stored under <ticket id>/<random>.<ext> and registered in
 * maintenance_attachments. Returns how many failed; the ticket itself already exists either way.
 */
async function uploadAttachments(ticketId: string, files: File[]): Promise<number> {
  const supabase = createClient();
  let failed = 0;
  for (const file of files) {
    try {
      const type = sniffAttachmentType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
      if (!type) throw new Error("unsupported type");
      const path = `${ticketId}/${crypto.randomUUID()}.${type.ext}`;
      const up = await supabase.storage.from("maintenance-attachments").upload(path, file, { contentType: type.mime, upsert: false });
      if (up.error) throw up.error;
      const row = await supabase.from("maintenance_attachments").insert({ maintenance_request_id: ticketId, storage_path: path });
      if (row.error) throw row.error;
    } catch {
      failed += 1;
    }
  }
  return failed;
}

function TicketForm({ tenancyId, onDone }: { tenancyId: string; onDone: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<TicketFormState>(initialFormState);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    setFileError(null);
    const next = [...files];
    for (const f of picked) {
      if (next.length >= MAX_ATTACHMENTS) return setFileError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      if (f.size > ATTACHMENT_MAX_BYTES) return setFileError(`${f.name} is larger than 8 MB.`);
      if (!sniffAttachmentType(new Uint8Array(await f.slice(0, 16).arrayBuffer()))) return setFileError(`${f.name}: use a PNG, JPEG, WebP or PDF file.`);
      next.push(f);
    }
    setFiles(next);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState(initialFormState);
    start(async () => {
      try {
        const res = await submitTicketAction(fd);
        if (res.status !== "success" || !res.ticketId) return setState(res);
        const failed = files.length ? await uploadAttachments(res.ticketId, files) : 0;
        form.reset();
        setFiles([]);
        onDone();
        router.push(`/tenant/tickets/${res.ticketId}${failed ? "?upload=partial" : ""}`);
        router.refresh();
      } catch {
        setState({ status: "error", message: "Something went wrong. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <Field label="What needs fixing?" htmlFor="tk-title" error={err("title")}>
        <Input id="tk-title" name="title" maxLength={120} placeholder="e.g. Kitchen sink is leaking" aria-invalid={err("title") ? true : undefined} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="tk-category" error={err("category")}>
          <Select id="tk-category" name="category" defaultValue="general">
            {MAINTENANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Priority</legend>
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-input p-1">
            {MAINTENANCE_PRIORITIES.map((p) => (
              <label key={p} className="cursor-pointer">
                <input type="radio" name="priority" value={p} defaultChecked={p === "medium"} className="peer sr-only" />
                <span
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-center text-sm text-muted-foreground transition-colors",
                    "peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </span>
              </label>
            ))}
          </div>
          {err("priority") ? <p role="alert" className="mt-1.5 text-xs text-destructive">{err("priority")}</p> : null}
        </fieldset>
      </div>

      <Field label="Details" htmlFor="tk-desc" optional error={err("description")} hint="When did it start? Where exactly? Anything we should know before visiting?">
        <Textarea id="tk-desc" name="description" rows={4} maxLength={4000} />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Photos or documents <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{kb(f.size)}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {files.length < MAX_ATTACHMENTS ? (
            <Button type="button" variant="secondary" size="sm" icon={Paperclip} onClick={() => picker.current?.click()}>
              Add file
            </Button>
          ) : null}
          <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" aria-label="Attach files" onChange={onPick} />
          <p className="text-xs text-muted-foreground">Up to {MAX_ATTACHMENTS} files, 8 MB each. PNG, JPEG, WebP or PDF.</p>
          {fileError ? <p role="alert" className="text-xs text-destructive">{fileError}</p> : null}
        </div>
      </div>

      {state.status === "error" && state.message ? <Alert variant="error">{state.message}</Alert> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" icon={Send} loading={pending} loadingText="Submitting…">Submit ticket</Button>
      </div>
    </form>
  );
}

export function SubmitTicketDialog({ tenancyId }: { tenancyId: string }) {
  return (
    <Dialog
      title="Submit a maintenance ticket"
      description="Tell us what needs fixing. Photos help a lot."
      trigger={(open) => (
        <Button icon={Plus} onClick={open}>
          Submit ticket
        </Button>
      )}
    >
      {(close) => <TicketForm tenancyId={tenancyId} onDone={close} />}
    </Dialog>
  );
}
