import { Building2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementsTab } from "../announcements/AnnouncementsTab";
import { BillingTab } from "../billing/BillingTab";
import { TenantsSection } from "../tenants/TenantsSection";
import { UnitRowActions } from "../units/UnitRowActions";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getMyProperty, getPropertyAmenityIds, listAmenities, listUnits } from "@/lib/services/properties";
import { listActiveTenancies } from "@/lib/services/tenancies";
import { StaffPanel } from "../staff/StaffPanel";
import { PropertyTabs, type PropertyTab } from "./PropertyTabs";

const money = (n: number, currency: string) => `${currency} ${Number(n).toLocaleString()}`;

const VERIFY_HINT: Record<string, string> = {
  unverified: "Not yet verified. Verification submission is coming soon; it is reviewed by the platform admin.",
  pending: "Verification submitted and waiting for review.",
  under_review: "An admin is reviewing this property.",
  verified: "Verified. This property can be shown publicly once published.",
  rejected: "Verification was rejected. Review the feedback and resubmit.",
  suspended: "This property has been suspended by the platform admin.",
};

type Props = { propertyId: string; tab: PropertyTab; month?: string; unitId?: string };

export async function PropertyDetailPage({ propertyId, tab, month, unitId }: Props) {
  const user = await requireRole(OPERATOR_ROLES);
  const isOwner = user.role === "landlord";
  const property = await getMyProperty(propertyId);
  if (!property) notFound();
  const base = `/landlord/properties/${propertyId}`;
  const address = [property.address_line_1, property.address_line_2, property.city, property.county_or_region, property.country]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <PageHeader
        title={property.name}
        description={address}
        actions={
          isOwner ? (
            <Link href={`${base}/edit`} className={buttonVariants({ variant: "secondary" })}>
              <Pencil className="size-4" aria-hidden />
              Edit profile
            </Link>
          ) : undefined
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">{property.property_type}</span>
        <StatusBadge status={property.status} />
        <StatusBadge status={property.verification_status} />
        <span className="text-xs text-muted-foreground">{VERIFY_HINT[property.verification_status]}</span>
      </div>

      <PropertyTabs propertyId={propertyId} active={isOwner || tab !== "staff" ? tab : "units"} isOwner={isOwner} />

      {tab === "units" || (tab === "staff" && !isOwner) ? <UnitsTab propertyId={propertyId} description={property.description} /> : null}
      {tab === "tenants" ? <TenantsSection propertyId={propertyId} propertyCode={property.property_code} selectedUnitId={unitId} /> : null}
      {tab === "billing" ? <BillingTab propertyId={propertyId} month={month} unitId={unitId} isOwner={isOwner} /> : null}
      {tab === "staff" && isOwner ? <StaffPanel propertyId={propertyId} /> : null}
      {tab === "announcements" ? <AnnouncementsTab propertyId={propertyId} /> : null}
    </>
  );
}

async function UnitsTab({ propertyId, description }: { propertyId: string; description: string | null }) {
  const [units, amenities, amenityIds, tenancies] = await Promise.all([
    listUnits(propertyId),
    listAmenities(),
    getPropertyAmenityIds(propertyId),
    listActiveTenancies(propertyId),
  ]);
  const chosen = amenities.filter((a) => amenityIds.includes(a.id));
  const tenancyByUnit = new Map(tenancies.map((t) => [t.unit_id, t]));
  const base = `/landlord/properties/${propertyId}`;
  const th = "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <>
      {description ? <p className="mb-4 max-w-3xl text-sm text-foreground/80">{description}</p> : null}
      {chosen.length ? (
        <p className="mb-6 flex flex-wrap gap-2 text-xs">
          {chosen.map((a) => (
            <span key={a.id} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-muted-foreground">
              {a.name}
            </span>
          ))}
        </p>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Units <span className="text-muted-foreground">({units.length})</span></h2>
        <Link href={`${base}/units/new`} className={buttonVariants()}>
          <Plus className="size-4" aria-hidden />
          Add units
        </Link>
      </div>
      {units.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No units yet"
          hint="Add the rentable units in this property, one at a time or in bulk by floor or spreadsheet."
          action={
            <Link href={`${base}/units/new`} className={buttonVariants()}>
              <Plus className="size-4" aria-hidden />
              Add your first units
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className={th}>Unit</th>
                <th className={th}>Type</th>
                <th className={th}>Beds / baths</th>
                <th className={th}>Rent</th>
                <th className={th}>Tenant</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const tenancy = tenancyByUnit.get(u.id);
                return (
                  <tr key={u.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.unit_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.unit_type ?? "-"}</td>
                    <td className="px-4 py-3 tabular-nums">{u.bedrooms} / {Number(u.bathrooms)}</td>
                    <td className="px-4 py-3 tabular-nums">{money(u.monthly_rent, u.currency)}</td>
                    <td className="px-4 py-3">{tenancy?.tenant_name ?? <span className="text-muted-foreground">-</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <UnitRowActions
                        propertyId={propertyId}
                        unit={{ id: u.id, unit_number: u.unit_number, status: u.status }}
                        tenancyId={tenancy?.tenancy_id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
