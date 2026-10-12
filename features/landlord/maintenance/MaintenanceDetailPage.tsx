import { ArrowLeft, Paperclip, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentGrid } from "@/components/layout/AttachmentGrid";
import { CategoryChip, PriorityBadge, TicketStatusBadge, TicketTimeline } from "@/components/layout/TicketBits";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getTicket, getTicketTenants } from "@/lib/services/maintenance";
import { UpdateTicketForm } from "./UpdateTicketForm";

export async function MaintenanceDetailPage({ ticketId }: { ticketId: string }) {
  await requireRole(OPERATOR_ROLES);
  const data = await getTicket(ticketId);
  if (!data) notFound();
  const { ticket, updates, attachments } = data;
  const tenant = (await getTicketTenants([ticket.tenancy_id])).get(ticket.tenancy_id);

  return (
    <>
      <Link href="/landlord/maintenance" className={`${buttonVariants({ variant: "ghost", size: "sm" })} -ml-3 mb-4`}>
        <ArrowLeft className="size-4" aria-hidden />
        All tickets
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.property_name} · Unit {ticket.unit_number} · opened {formatDate(ticket.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <CategoryChip category={ticket.category} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Activity" description="What has happened on this ticket." />
            <TicketTimeline updates={updates} viewer="staff" />
          </Card>

          {ticket.status !== "cancelled" ? (
            <Card>
              <CardHeader title="Post an update" />
              <UpdateTicketForm ticketId={ticket.id} status={ticket.status} />
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">The tenant cancelled this ticket.</p>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Tenant" />
            {tenant?.name ? (
              <>
                <p className="text-sm font-medium">{tenant.name}</p>
                {tenant.phone ? (
                  <a href={`tel:${tenant.phone}`} className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <Phone className="size-4" aria-hidden />
                    {tenant.phone}
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unit {ticket.unit_number}. Tenant details are visible to owners and managers.</p>
            )}
          </Card>

          {ticket.description ? (
            <Card>
              <CardHeader title="Description" />
              <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            </Card>
          ) : null}

          {attachments.length > 0 ? (
            <Card>
              <CardHeader icon={Paperclip} title="Attachments" />
              <AttachmentGrid attachments={attachments} />
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
