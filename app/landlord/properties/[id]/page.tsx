import { PropertyDetailPage, parsePropertyTab } from "@/features/landlord";

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <PropertyDetailPage propertyId={id} tab={parsePropertyTab(sp.tab)} month={one(sp.month)} unitId={one(sp.unit)} />;
}
