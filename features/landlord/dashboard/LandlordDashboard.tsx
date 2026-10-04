import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export function LandlordDashboard() {
  return (
    <>
      <PageHeader title="Landlord dashboard" description="Your properties, units, tenants, payments and maintenance." />
      <EmptyState title="No data yet" hint="Add a property to get started." />
    </>
  );
}
