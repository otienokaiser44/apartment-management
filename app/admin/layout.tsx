import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { adminNav } from "@/features/admin";
import { ROLE_HOME } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getShellAccount } from "@/lib/services/account";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("admin");
  const account = await getShellAccount(user, ROLE_HOME.admin);
  return (
    <RoleShell title="Admin" nav={adminNav} userEmail={user.email} account={account}>
      {children}
    </RoleShell>
  );
}
