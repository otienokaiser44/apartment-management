import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { listAllActiveTenants, pendingByProperty } from "@/lib/services/overview";
import { listMyProperties } from "@/lib/services/properties";

const btn = "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted";

/** All tenants across the landlord's properties, with shortcuts to invite, link and approve per property. */
export async function TenantsPage() {
  const [tenants, properties, pending] = await Promise.all([listAllActiveTenants(), listMyProperties(), pendingByProperty()]);

  return (
    <>
      <PageHeader title="Tenants" description="Everyone currently renting from you, and what needs your attention." />

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" hint="Add a property and its units before inviting tenants." />
      ) : (
        <section aria-label="By property" className="mb-8 grid gap-4 sm:grid-cols-2">
          {properties.map((p) => {
            const n = pending.get(p.id);
            const waiting = (n?.requests ?? 0) + (n?.links ?? 0);
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.units.filter((u) => u.status === "vacant").length} vacant · {p.units.filter((u) => u.status === "occupied").length} occupied
                </p>
                {waiting > 0 ? (
                  <p className="mt-2 text-sm text-warning">
                    {n?.requests ? `${n.requests} request${n.requests === 1 ? "" : "s"} to review` : ""}
                    {n?.requests && n?.links ? " · " : ""}
                    {n?.links ? `${n.links} awaiting tenant reply` : ""}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className={btn} href={`/landlord/properties/${p.id}?tab=tenants#invite`}>Invite tenant</Link>
                  <Link className={btn} href={`/landlord/properties/${p.id}?tab=tenants`}>Requests &amp; linking</Link>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <h2 className="mb-3 text-lg font-semibold">Current tenants ({tenants.length})</h2>
      {tenants.length === 0 ? (
        <EmptyState title="No active tenants yet" hint="Invite a tenant to a vacant unit, link an existing account, or approve a request." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tenant</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">Unit</th><th className="px-3 py-2">Since</th><th className="px-3 py-2">Rent</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.tenancy_id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{t.tenant_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{t.tenant_email}<br />{t.tenant_phone}</td>
                  <td className="px-3 py-2">{t.property_name}</td>
                  <td className="px-3 py-2">{t.unit_number}</td>
                  <td className="px-3 py-2">{t.start_date}</td>
                  <td className="px-3 py-2">{t.currency} {Number(t.monthly_rent).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Link className="hover:underline" href={`/landlord/properties/${t.property_id}?tab=billing`}>Billing</Link>
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
