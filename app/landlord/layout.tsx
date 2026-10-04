import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { landlordNav } from "@/features/landlord";

export default function LandlordLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell title="Landlord" nav={landlordNav}>
      {children}
    </RoleShell>
  );
}
