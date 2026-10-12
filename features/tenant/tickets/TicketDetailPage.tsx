import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/forms/ActionButton";
import { AttachmentGrid } from "@/components/layout/AttachmentGrid";
import { CategoryChip, PriorityBadge, TicketStatusBadge, TicketTimeline } from "@/components/layout/TicketBits";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/lib/auth/session";
import { getTicket } from "@/lib/services/maintenance";
import { cancelTicketAction } from "./actions";
import { CommentForm } from "./CommentForm";

export async function TicketDetailPage({ ticketId, uploadWarning }: { ticketId: string; uploadWarning?: boolean }) {
  await requireRole("tenant");
  const data = await getTicket(ticketId);
  if (!data) notFound();
  const { ticket, updates, attachments } = data;
  const finished = ticket.status === "closed" || ticket.status === "cancelled";

  return (
    <>
      <Link href="/tenant/tickets" className={`${buttonVariants({ variant: "ghost", size: "sm" })} -ml-3 mb-4`}>
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

      {uploadWarning ? (
        <Alert variant="info" className="mb-6">
          Your ticket was submitted, but some attachments could not be uploaded. You can describe the problem in a message below.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress" description="Every update from your landlord or caretaker shows up here." />
            <TicketTimeline updates={updates} viewer="tenant" />
          </Card>

          {!finished ? (
            <Card>
              <CommentForm ticketId={ticket.id} />
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">This ticket is {ticket.status}. If the problem is back, submit a new ticket.</p>
          )}
        </div>

        <aside className="space-y-6">
          {ticket.description ? (
            <Card>
              <CardHeader title="Your description" />
              <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            </Card>
          ) : null}

          {attachments.length > 0 ? (
            <Card>
              <CardHeader icon={Paperclip} title="Attachments" />
              <AttachmentGrid attachments={attachments} />
            </Card>
          ) : null}

          {ticket.status === "open" ? (
            <Card>
              <CardHeader title="Changed your mind?" description="You can cancel a ticket that nobody has started on yet." />
              <ActionButton label="Cancel ticket" confirm="Cancel this ticket?" action={cancelTicketAction.bind(null, ticket.id)} />
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
