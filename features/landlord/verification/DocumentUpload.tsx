"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MAX_VERIFICATION_DOCS, sniffVerificationDocType, VERIFICATION_DOC_MAX_BYTES } from "@/lib/validation/verification";
import { recordDocumentAction } from "./actions";

type Props = { propertyId: string; requestId: string; documentType: string; atLimit: boolean };

/**
 * Uploads straight from the browser to the private `verification-documents` bucket (large PDFs never pass through a
 * server action), then registers the file. The file is identified by its content, not its name; if registering fails
 * the orphaned object is removed again.
 */
export function DocumentUpload({ propertyId, requestId, documentType, atLimit }: Props) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size === 0) return setError("That file is empty.");
    if (file.size > VERIFICATION_DOC_MAX_BYTES) return setError("That file is larger than 10 MB.");
    const type = sniffVerificationDocType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!type) return setError("Use a PDF, PNG or JPEG file.");

    setBusy(true);
    const supabase = createClient();
    const path = `${propertyId}/${crypto.randomUUID()}.${type.ext}`;
    try {
      const up = await supabase.storage.from("verification-documents").upload(path, file, { contentType: type.mime, upsert: false });
      if (up.error) throw new Error("Could not upload the file. Please try again.");
      const r = await recordDocumentAction({ propertyId, requestId, documentType, storagePath: path });
      if (!r.ok) {
        await supabase.storage.from("verification-documents").remove([path]);
        throw new Error(r.message);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="secondary" size="sm" icon={Upload} loading={busy} loadingText="Uploading…" disabled={atLimit} onClick={() => picker.current?.click()}>
        Upload
      </Button>
      <input ref={picker} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" aria-label={`Upload ${documentType.replace(/_/g, " ")}`} onChange={onPick} />
      {atLimit ? <p className="text-xs text-muted-foreground">Limit of {MAX_VERIFICATION_DOCS} files reached.</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
