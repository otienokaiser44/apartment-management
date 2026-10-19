import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth/session";
import { getVerificationDetail } from "@/lib/services/admin";
import { formatDate, formatDateTime } from "../format";
import { ReviewPanel } from "./ReviewPanel";

const OPEN_STATUSES = ["submitted", "under_review"];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">-</span>}</dd>
    </div>
  );
}

export async function VerificationDetailPage({ requestId }: { requestId: string }) {
  await requireRole("admin");
  const d = await getVerificationDetail(requestId);
  if (!d) notFound();
  const isOpen = OPEN_STATUSES.includes(d.status);

  return (
    <>
      <Link href="/admin/verification" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to queue
      </Link>
      <PageHeader title={d.property.name} description={[d.property.address, d.property.city].filter(Boolean).join(", ")} />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={d.status} />
        <span className="text-xs text-muted-foreground">Submitted {formatDateTime(d.submitted_at)}</span>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <section aria-label="Property" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Property</h2>
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Code">{d.property.property_code}</Fact>
            <Fact label="Listing"><StatusBadge status={d.property.status} /></Fact>
            <Fact label="Verification"><StatusBadge status={d.property.verification_status} /></Fact>
          </dl>
        </section>
        <section aria-label="Landlord" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">Landlord</h2>
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Name">{d.landlord.name}</Fact>
            <Fact label="Business">{d.landlord.business_name}</Fact>
            <Fact label="Email">{d.landlord.email}</Fact>
            <Fact label="Phone">{d.landlord.phone}</Fact>
          </dl>
        </section>
      </div>

      <section aria-label="Documents" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Documents <span className="text-muted-foreground">({d.documents.length})</span></h2>
        {d.documents.length === 0 ? (
          <EmptyState icon={FileText} title="No documents attached" hint="This request has no uploaded evidence." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
            {d.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {formatDate(doc.created_at)}</p>
                </div>
                <StatusBadge status={doc.status} />
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    Open
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Link unavailable</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Links expire after 5 minutes. Reload the page for fresh ones.</p>
      </section>

      {isOpen ? (
        <ReviewPanel requestId={d.id} status={d.status} missingRequired={d.missingRequired} />
      ) : (
        <Alert variant={d.status === "approved" ? "success" : "info"}>
          <p className="font-medium">
            {d.status === "approved" ? "Approved" : d.status === "rejected" ? "Rejected" : "Closed"} on {formatDateTime(d.reviewed_at)}
          </p>
          {d.rejection_reason ? <p className="mt-1">Reason: {d.rejection_reason}</p> : null}
          {d.admin_notes && d.admin_notes !== d.rejection_reason ? <p className="mt-1">Note: {d.admin_notes}</p> : null}
        </Alert>
      )}
    </>
  );
}
