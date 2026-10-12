import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listMyProperties } from "@/lib/services/properties";
import { PropertyList } from "./PropertyList";

export async function PropertiesPage() {
  const user = await requireRole(OPERATOR_ROLES);
  const isOwner = user.role === "landlord";
  const properties = await listMyProperties();
  return (
    <>
      <PageHeader
        title="Properties"
        description={isOwner ? "Your buildings and their units." : "The properties you were assigned to manage."}
        actions={
          isOwner ? (
            <Link href="/landlord/properties/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              Add property
            </Link>
          ) : undefined
        }
      />
      <PropertyList properties={properties} canAdd={isOwner} />
    </>
  );
}
