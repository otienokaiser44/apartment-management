import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { listVerificationQueue } from "@/lib/services/admin";
import { formatDate } from "../format";

const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

export async function VerificationQueuePage() {
  await requireRole("admin");
  const queue = await listVerificationQueue();

  return (
    <>
      <PageHeader title="Property verification" description="Requests from landlords, oldest first." />
      {queue.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nothing to review" hint="When a landlord submits a property for verification it appears here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className={th}>Property</th>
                <th className={th}>Landlord</th>
                <th className={th}>Documents</th>
                <th className={th}>Submitted</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.property_name}</p>
                    {r.city ? <p className="text-xs text-muted-foreground">{r.city}</p> : null}
                  </td>
                  <td className="px-4 py-3">{r.landlord_name ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.document_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.submitted_at)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/verification/${r.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
