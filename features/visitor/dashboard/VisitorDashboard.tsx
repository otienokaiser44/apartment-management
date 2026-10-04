import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export function VisitorDashboard() {
  return (
    <>
      <PageHeader title="Visitor dashboard" description="Find a place to live." />
      <EmptyState title="No listings to show yet" hint="Published, verified listings appear here." />
    </>
  );
}
