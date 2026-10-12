import { LandlordLoginPage } from "@/features/landlord";

export default async function Page({ searchParams }: PageProps<"/auth/landlord/login">) {
  const { next, error } = await searchParams;
  return <LandlordLoginPage next={typeof next === "string" ? next : undefined} error={typeof error === "string" ? error : undefined} />;
}
