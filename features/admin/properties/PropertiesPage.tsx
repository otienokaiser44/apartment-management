import { Building2 } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { Select } from "@/components/ui/field";
import { requireRole } from "@/lib/auth/session";
import { listProperties, PROPERTY_VERIFICATION_FILTERS } from "@/lib/services/adminDirectory";
import { formatDate, humanizeAction } from "../format";
import { SearchForm } from "../SearchForm";

const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

export async function AdminPropertiesPage({ q = "", verification = "" }: { q?: string; verification?: string }) {
  await requireRole("admin");
  const { rows, total, truncated } = await listProperties({ q, verification });
  const filtered = Boolean(q || verification);

  return (
    <>
      <PageHeader title="Properties" description={`${total} ${total === 1 ? "property" : "properties"} on the platform.`} />
      <SearchForm placeholder="Search name, city or property code" q={q}>
        <Select name="verification" defaultValue={verification} aria-label="Verification status" className="w-44">
          <option value="">All verification</option>
          {PROPERTY_VERIFICATION_FILTERS.map((s) => (
            <option key={s} value={s}>
              {humanizeAction(s)}
            </option>
          ))}
        </Select>
      </SearchForm>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? "No properties match" : "No properties yet"}
          hint={filtered ? "Try a different search or clear the filter." : "Properties appear here once landlords add them."}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className={th}>Property</th>
                  <th className={th}>Landlord</th>
                  <th className={th}>Units</th>
                  <th className={th}>Listing</th>
                  <th className={th}>Verification</th>
                  <th className={th}>Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{[p.city, p.property_code].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">{p.landlord_name ?? <span className="text-muted-foreground">-</span>}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {p.units} <span className="text-xs text-muted-foreground">({p.occupied} occupied)</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.verification_status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the newest {rows.length} of {total}. Narrow the search to see others.
            </p>
          ) : null}
        </>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Waiting for a decision? Open the{" "}
        <Link href="/admin/verification" className="underline underline-offset-2 hover:text-foreground">
          verification queue
        </Link>
        .
      </p>
    </>
  );
}
