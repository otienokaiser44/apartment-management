import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { tenantNav } from "@/features/tenant";

export default function TenantLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell title="Tenant" nav={tenantNav}>
      {children}
    </RoleShell>
  );
}
