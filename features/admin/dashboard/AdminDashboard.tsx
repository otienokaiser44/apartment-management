import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";

export function AdminDashboard() {
  return (
    <>
      <PageHeader title="Admin dashboard" description="Platform health, moderation queue and recent activity." />
      <EmptyState title="Nothing to show yet" hint="Metrics appear once the admin queries are wired to the database." />
    </>
  );
}
