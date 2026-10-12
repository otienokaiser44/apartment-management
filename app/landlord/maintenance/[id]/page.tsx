import { MaintenanceDetailPage } from "@/features/landlord";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaintenanceDetailPage ticketId={id} />;
}
