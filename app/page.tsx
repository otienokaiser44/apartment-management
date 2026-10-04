import { RoleShell } from "@/components/layout/RoleShell";
import { VisitorDashboard, visitorNav } from "@/features/visitor";

/** `/` is the public homepage; it composes the same visitor feature as `/visitor`. */
export default function Home() {
  return (
    <RoleShell title="Apartments" nav={visitorNav}>
      <VisitorDashboard />
    </RoleShell>
  );
}
