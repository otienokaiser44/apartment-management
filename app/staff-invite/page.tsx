import { StaffInvitePage } from "@/features/manager";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return <StaffInvitePage token={typeof token === "string" ? token : undefined} />;
}
