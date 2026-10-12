import { SettingsPage } from "@/features/account";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { section } = await searchParams;
  return <SettingsPage section={typeof section === "string" ? section : undefined} basePath="/landlord/settings" />;
}
