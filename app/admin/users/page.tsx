import { AdminUsersPage, parsePeopleRole } from "@/features/admin";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; q?: string }> }) {
  const { role, q } = await searchParams;
  return <AdminUsersPage role={parsePeopleRole(role)} q={q} />;
}
