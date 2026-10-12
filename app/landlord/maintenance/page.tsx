import { MaintenancePage } from "@/features/landlord";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { status } = await searchParams;
  return <MaintenancePage filter={typeof status === "string" ? status : undefined} />;
}
