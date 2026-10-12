import { CheckCircle2, Droplets, Hammer, MessageSquare, PlusCircle, RefreshCw, Wrench, Zap, type LucideIcon } from "lucide-react";
import { Timeline, type TimelineEvent } from "@/components/layout/Timeline";
import { StatusBadge } from "@/components/layout/StatusBadge";
import type { TicketUpdate } from "@/lib/services/maintenance";
import {
  CATEGORY_LABEL, PRIORITY_LABEL, TICKET_STATUS_LABEL, type MaintenanceCategory, type MaintenancePriority, type MaintenanceStatus,
} from "@/lib/validation/portal";

export const CATEGORY_ICON: Record<MaintenanceCategory, LucideIcon> = {
  plumbing: Droplets,
  electrical: Zap,
  carpentry: Hammer,
  general: Wrench,
};

/** Icon + label for a ticket category. */
export function CategoryChip({ category }: { category: MaintenanceCategory }) {
  const Icon = CATEGORY_ICON[category] ?? Wrench;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

export const PriorityBadge = ({ priority }: { priority: MaintenancePriority }) => (
  <StatusBadge status={priority} label={`${PRIORITY_LABEL[priority] ?? priority} priority`} />
);

export const TicketStatusBadge = ({ status }: { status: MaintenanceStatus }) => (
  <StatusBadge status={status} label={TICKET_STATUS_LABEL[status] ?? status} />
);

const ROLE_LABEL: Record<TicketUpdate["author_role"], string> = {
  tenant: "Tenant",
  landlord: "Landlord",
  manager: "Property manager",
  caretaker: "Caretaker",
  admin: "Support",
};

const STATUS_TONE: Record<MaintenanceStatus, TimelineEvent["tone"]> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
  cancelled: "neutral",
};

/** The ticket's history as a timeline. `viewer` decides whether the tenant's own entries read "You" or "Tenant". */
export function TicketTimeline({ updates, viewer }: { updates: TicketUpdate[]; viewer: "tenant" | "staff" }) {
  const events: TimelineEvent[] = updates.map((u) => {
    const actor = u.author_role === "tenant" && viewer === "tenant" ? "You" : ROLE_LABEL[u.author_role];
    const base = { id: u.id, actor, at: u.created_at, body: u.message };
    if (u.kind === "created") return { ...base, text: "opened this ticket", icon: PlusCircle, tone: "info" as const };
    if (u.kind === "comment") return { ...base, text: "wrote", icon: MessageSquare, tone: "neutral" as const };
    const to = u.to_status as MaintenanceStatus;
    return {
      ...base,
      text: <>changed the status to <strong className="text-foreground">{TICKET_STATUS_LABEL[to] ?? to}</strong></>,
      icon: to === "resolved" ? CheckCircle2 : RefreshCw,
      tone: STATUS_TONE[to] ?? "neutral",
    };
  });
  return <Timeline events={events} />;
}
