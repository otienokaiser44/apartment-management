import { ManagerLoginPage } from "@/features/manager";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, error } = await searchParams;
  return <ManagerLoginPage next={typeof next === "string" ? next : undefined} error={typeof error === "string" ? error : undefined} />;
}
