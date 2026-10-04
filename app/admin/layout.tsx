import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { adminNav } from "@/features/admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell title="Admin" nav={adminNav}>
      {children}
    </RoleShell>
  );
}
