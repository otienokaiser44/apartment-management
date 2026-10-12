import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { navForRole } from "@/features/landlord";
import { OPERATOR_ROLES, ROLE_HOME } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getShellAccount } from "@/lib/services/account";

/** Owners and delegated managers/caretakers share this area; the database limits each to their own properties. */
export default async function LandlordLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(OPERATOR_ROLES);
  const account = await getShellAccount(user, ROLE_HOME[user.role]);
  return (
    <RoleShell title={user.role === "manager" ? "Property manager" : "Landlord"} nav={navForRole(user.role)} userEmail={user.email} account={account}>
      {children}
    </RoleShell>
  );
}
