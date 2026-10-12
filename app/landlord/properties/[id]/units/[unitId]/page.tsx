import { UnitFormPage } from "@/features/landlord";

export default async function Page({ params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  return <UnitFormPage propertyId={id} unitId={unitId} />;
}
