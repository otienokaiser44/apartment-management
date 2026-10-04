import type { ReactNode } from "react";
import { RoleShell } from "@/components/layout/RoleShell";
import { visitorNav } from "@/features/visitor";

export default function VisitorLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell title="Apartments" nav={visitorNav}>
      {children}
    </RoleShell>
  );
}
