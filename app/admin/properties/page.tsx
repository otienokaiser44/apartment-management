import { AdminPropertiesPage } from "@/features/admin";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; verification?: string }> }) {
  const { q, verification } = await searchParams;
  return <AdminPropertiesPage q={q} verification={verification} />;
}
