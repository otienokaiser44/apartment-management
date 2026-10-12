import { PageHeader } from "@/components/layout/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { StaffPanel } from "../staff/StaffPanel";

/** Owner-only: invite property managers and caretakers, see the team and remove access. */
export async function ManagersPage() {
  await requireRole("landlord");
  return (
    <>
      <PageHeader
        title="Managers & staff"
        description="Give property managers and caretakers access to specific properties. They see only what you assign."
      />
      <StaffPanel />
    </>
  );
}
