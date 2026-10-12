import { InvoicesPage } from "@/features/tenant";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { invoice } = await searchParams;
  return <InvoicesPage invoiceId={typeof invoice === "string" ? invoice : undefined} />;
}
