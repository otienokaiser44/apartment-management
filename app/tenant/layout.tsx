import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { tenantNav } from "@/features/tenant";
import { ROLE_HOME } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getShellAccount } from "@/lib/services/account";

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("tenant");
  const account = await getShellAccount(user, ROLE_HOME.tenant);
  return (
    <RoleShell title="Tenant" nav={tenantNav} userEmail={user.email} account={account}>
      {children}
    </RoleShell>
  );
}
