import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export function TenantDashboard() {
  return (
    <>
      <PageHeader title="Tenant dashboard" description="Your tenancy, payments, maintenance and notices." />
      <EmptyState title="No active tenancy" hint="Accept an invitation or apply for a unit to get started." />
    </>
  );
}
