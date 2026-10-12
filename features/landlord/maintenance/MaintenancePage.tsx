import { Wrench } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryChip, PriorityBadge, TicketStatusBadge } from "@/components/layout/TicketBits";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/lib/format";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { getTicketTenants, listTickets } from "@/lib/services/maintenance";
import { TICKET_STATUS_LABEL } from "@/lib/validation/portal";

const FILTERS = [
  { id: "open", label: "Open", statuses: ["open"] },
  { id: "progress", label: "In progress", statuses: ["in_progress"] },
  { id: "done", label: "Resolved & closed", statuses: ["resolved", "closed", "cancelled"] },
  { id: "all", label: "All", statuses: [] },
] as const;

const ROLE = { tenant: "Tenant", landlord: "Landlord", manager: "Manager", caretaker: "Caretaker", admin: "Support" } as const;

/** Tickets across the properties the caller owns, manages or looks after. */
export async function MaintenancePage({ filter }: { filter?: string }) {
  await requireRole(OPERATOR_ROLES);
  const tickets = await listTickets({ limit: 300 });
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const shown = active.statuses.length ? tickets.filter((t) => (active.statuses as readonly string[]).includes(t.status)) : tickets;
  const tenants = await getTicketTenants([...new Set(shown.map((t) => t.tenancy_id))]);
  const count = (statuses: readonly string[]) => (statuses.length ? tickets.filter((t) => statuses.includes(t.status)).length : tickets.length);

  return (
    <>
      <PageHeader title="Maintenance" description="Repair tickets from your tenants. Update the status and they are notified." />

      <nav aria-label="Ticket filters" className="mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/landlord/maintenance?status=${f.id}`}
              aria-current={f.id === active.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                f.id === active.id ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="rounded-full bg-muted px-1.5 text-xs">{count(f.statuses)}</span>
            </Link>
          ))}
        </div>
      </nav>

      {shown.length === 0 ? (
        <EmptyState icon={Wrench} title="No tickets here" hint="When a tenant reports a problem it appears in this list." />
      ) : (
        <ul className="space-y-3">
          {shown.map((t) => {
            const tenant = tenants.get(t.tenancy_id);
            const l = t.latest;
            return (
              <li key={t.id}>
                <Link
                  href={`/landlord/maintenance/${t.id}`}
                  className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{t.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.property_name} · Unit {t.unit_number}
                        {tenant?.name ? ` · ${tenant.name}` : ""} · opened {formatDate(t.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryChip category={t.category} />
                      <PriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </div>
                  {l ? (
                    <p className="mt-3 line-clamp-1 border-t border-border pt-3 text-xs text-muted-foreground">
                      {ROLE[l.author_role]}:{" "}
                      {l.kind === "status_change" ? `status → ${TICKET_STATUS_LABEL[l.to_status ?? "open"]}${l.message ? ` (${l.message})` : ""}` : l.message}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
