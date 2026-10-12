import { Wrench } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { listTickets } from "@/lib/services/maintenance";
import { getMyTenancies } from "@/lib/services/tenant";
import { SubmitTicketDialog } from "./SubmitTicketDialog";
import { TicketBoard } from "./TicketBoard";

/** The tenant's maintenance tracker. */
export async function TicketsPage() {
  await requireRole("tenant");
  const [tickets, tenancies] = await Promise.all([listTickets(), getMyTenancies()]);
  const active = tenancies.find((t) => t.tenancy_status === "active");

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Report a problem and follow it until it is fixed."
        actions={active ? <SubmitTicketDialog tenancyId={active.tenancy_id} /> : undefined}
      />
      {tickets.length > 0 ? (
        <TicketBoard tickets={tickets} hrefBase="/tenant/tickets" />
      ) : active ? (
        <EmptyState
          icon={Wrench}
          title="No tickets yet"
          hint="When something breaks or needs attention, submit a ticket and your landlord or caretaker will update you here."
          action={<SubmitTicketDialog tenancyId={active.tenancy_id} />}
        />
      ) : (
        <EmptyState
          icon={Wrench}
          title="Maintenance opens once you have a home"
          hint="Tickets are available when you have an active tenancy. Accept an invitation or link to your apartment from the dashboard."
          action={
            <Link href="/tenant" className={buttonVariants()}>
              Go to dashboard
            </Link>
          }
        />
      )}
    </>
  );
}
