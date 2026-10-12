import { TicketDetailPage } from "@/features/tenant";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { upload } = await searchParams;
  return <TicketDetailPage ticketId={id} uploadWarning={upload === "partial"} />;
}
