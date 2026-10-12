import { ClaimUnitPage } from "@/features/tenant";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return <ClaimUnitPage token={typeof token === "string" ? token : undefined} />;
}
