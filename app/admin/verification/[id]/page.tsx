import { notFound } from "next/navigation";
import { VerificationDetailPage } from "@/features/admin";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Cheap shape check before hitting the database; RLS still decides what is visible.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <VerificationDetailPage requestId={id} />;
}
