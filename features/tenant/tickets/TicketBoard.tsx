import { CheckCircle2, CircleDot, Loader } from "lucide-react";
import Link from "next/link";
import { CategoryChip, PriorityBadge } from "@/components/layout/TicketBits";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/lib/format";
import type { TicketRow } from "@/lib/services/maintenance";
import { TICKET_STATUS_LABEL } from "@/lib/validation/portal";

const ROLE_LABEL = { tenant: "You", landlord: "Landlord", manager: "Property manager", caretaker: "Caretaker", admin: "Support" } as const;

function TicketCard({ ticket, href }: { ticket: TicketRow; href: string }) {
  const l = ticket.latest;
  const latestText = l
    ? l.kind === "status_change"
      ? `${ROLE_LABEL[l.author_role]} set it to ${TICKET_STATUS_LABEL[l.to_status ?? "open"]}${l.message ? `: ${l.message}` : ""}`
      : `${ROLE_LABEL[l.author_role]}: ${l.message}`
    : null;
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
      </div>
      <p className="mt-3 font-medium leading-snug">{ticket.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Unit {ticket.unit_number} · opened {formatDate(ticket.created_at)}
      </p>
      {latestText ? <p className="mt-3 line-clamp-2 border-t border-border pt-3 text-xs text-muted-foreground">{latestText}</p> : null}
    </Link>
  );
}

const COLUMNS = [
  { key: "open", title: "Open", icon: CircleDot, statuses: ["open"], tone: "text-warning" },
  { key: "progress", title: "In progress", icon: Loader, statuses: ["in_progress"], tone: "text-info" },
  { key: "done", title: "Resolved & history", icon: CheckCircle2, statuses: ["resolved", "closed", "cancelled"], tone: "text-success" },
] as const;

/** Three-column tracker: what is waiting, what is being worked on, and what is finished. */
export function TicketBoard({ tickets, hrefBase }: { tickets: TicketRow[]; hrefBase: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {COLUMNS.map(({ key, title, icon: Icon, statuses, tone }) => {
        const items = tickets.filter((t) => (statuses as readonly string[]).includes(t.status));
        return (
          <section key={key} aria-label={title} className="rounded-2xl border border-border bg-muted/30 p-3">
            <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
              <Icon className={cn("size-4", tone)} aria-hidden />
              {title}
              <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">{items.length}</span>
            </h2>
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                items.map((t) => <TicketCard key={t.id} ticket={t} href={`${hrefBase}/${t.id}`} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
