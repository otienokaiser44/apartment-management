import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { listMyProperties } from "@/lib/services/properties";

/** Announcements entry point: choose the property whose tenants you want to notify. */
export async function AnnouncementsOverviewPage() {
  const properties = await listMyProperties();
  return (
    <>
      <PageHeader title="Announcements" description="Send a notice to all tenants, a floor, a unit, or tenants with unpaid invoices." />
      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property first." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-sm">
              <span>
                <span className="font-medium">{p.name}</span>
                <span className="block text-sm text-muted-foreground">{p.units.filter((u) => u.status === "occupied").length} occupied units</span>
              </span>
              <Link className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90" href={`/landlord/properties/${p.id}?tab=announcements`}>
                New announcement
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
