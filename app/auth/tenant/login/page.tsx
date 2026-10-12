import { TenantLoginPage } from "@/features/tenant";

export default async function Page({ searchParams }: PageProps<"/auth/tenant/login">) {
  const { next, error } = await searchParams;
  return <TenantLoginPage next={typeof next === "string" ? next : undefined} error={typeof error === "string" ? error : undefined} />;
}
