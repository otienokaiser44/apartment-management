import { CheckCircle2, FileText } from "lucide-react";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Alert } from "@/components/ui/alert";
import { getLatestRequest, listDocumentTypes } from "@/lib/services/verification";
import { MAX_VERIFICATION_DOCS, REQUEST_STATUS_HINT } from "@/lib/validation/verification";
import { DocumentUpload } from "./DocumentUpload";
import { RemoveDocumentButton, StartButton, SubmitButton, WithdrawButton } from "./VerificationControls";

type Props = { propertyId: string; verificationStatus: string };

/**
 * Owner-only. Drives the request lifecycle through the start / submit / withdraw functions; a property only becomes
 * verified when an administrator approves the request, never from here.
 */
export async function VerificationTab({ propertyId, verificationStatus }: Props) {
  const [request, types] = await Promise.all([getLatestRequest(propertyId), listDocumentTypes()]);
  const labelOf = new Map(types.map((t) => [t.code, t.label]));

  if (verificationStatus === "suspended") {
    return <Alert variant="error">This property was suspended by the platform administrator, so it cannot be verified right now.</Alert>;
  }

  const status = request?.status ?? null;
  const isDraft = status === "draft";
  const inReview = status === "submitted" || status === "under_review";
  const verified = verificationStatus === "verified";
  const docs = request?.documents ?? [];
  const have = new Set(docs.map((d) => d.document_type));
  const missing = types.filter((t) => t.is_required && !have.has(t.code));

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Property verification</h2>
          <StatusBadge status={verified ? "verified" : (status ?? "unverified")} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {verified
            ? "Verified. This property can be shown publicly once it is published."
            : status
              ? (REQUEST_STATUS_HINT[status] ?? "")
              : "Verified properties can be listed publicly. Upload proof that you own or manage this property and an administrator will review it."}
        </p>

        {status === "rejected" && request?.rejection_reason ? (
          <Alert variant="error" className="mt-4">
            <p className="font-medium">Reason from the administrator</p>
            <p className="mt-0.5">{request.rejection_reason}</p>
          </Alert>
        ) : null}

        {!verified && (!status || status === "rejected") ? (
          <div className="mt-4">
            <StartButton propertyId={propertyId} label={status === "rejected" ? "Start a new request" : "Start verification"} />
          </div>
        ) : null}
        {inReview && request ? (
          <div className="mt-4">
            <WithdrawButton propertyId={propertyId} requestId={request.id} />
          </div>
        ) : null}
      </section>

      {request && (isDraft || docs.length > 0) ? (
        <section aria-label="Documents" className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h3 className="font-semibold">Documents</h3>
            <p className="text-xs text-muted-foreground">PDF, PNG or JPEG, up to 10 MB each.</p>
          </div>
          <ul className="divide-y divide-border">
            {types.map((t) => {
              const mine = docs.filter((d) => d.document_type === t.code);
              return (
                <li key={t.code} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <span className="mt-0.5">
                    {mine.length ? <CheckCircle2 className="size-4 text-success" aria-label="Uploaded" /> : <FileText className="size-4 text-muted-foreground" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {t.label}
                      {t.is_required ? <span className="ml-1.5 text-xs font-normal text-warning">Required</span> : null}
                    </p>
                    {t.description ? <p className="text-xs text-muted-foreground">{t.description}</p> : null}
                    {mine.map((d) => (
                      <div key={d.id} className="mt-2 flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{labelOf.get(d.document_type) ?? d.document_type}, uploaded {new Date(d.created_at).toLocaleDateString("en-GB")}</span>
                        <StatusBadge status={d.status} />
                        {isDraft ? <RemoveDocumentButton propertyId={propertyId} documentId={d.id} name={t.label} /> : null}
                      </div>
                    ))}
                  </div>
                  {isDraft ? <DocumentUpload propertyId={propertyId} requestId={request.id} documentType={t.code} atLimit={docs.length >= MAX_VERIFICATION_DOCS} /> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {isDraft && request ? (
        <section className="space-y-3">
          {missing.length ? <Alert variant="info">Still needed before you can submit: {missing.map((m) => m.label).join(", ")}.</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton propertyId={propertyId} disabled={missing.length > 0 || docs.length === 0} />
            <WithdrawButton propertyId={propertyId} requestId={request.id} label="Discard draft" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
