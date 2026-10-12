import { DoorOpen, Phone } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { VacateStepper } from "@/components/layout/VacateStepper";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listVacateNoticesForStaff, type StaffVacateRow } from "@/lib/services/moveouts";
import { VACATE_STATUS_LABEL, nairobiNowLocal } from "@/lib/validation/portal";
import { NoticeActions } from "./NoticeActions";

const daysUntil = (iso: string) => Math.ceil((Date.parse(`${iso}T00:00:00Z`) - Date.now()) / 86_400_000);

function NoticeCard({ notice, minLocal }: { notice: StaffVacateRow; minLocal: string }) {
  const days = daysUntil(notice.intended_move_out_date);
  const live = ["submitted", "approved", "inspection_pending"].includes(notice.status);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">
            {notice.property_name} · Unit {notice.unit_number}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {notice.tenant_name ?? "Tenant"}
            {notice.tenant_phone ? (
              <>
                {" · "}
                <a href={`tel:${notice.tenant_phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3" aria-hidden />
                  {notice.tenant_phone}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <StatusBadge status={notice.status} label={VACATE_STATUS_LABEL[notice.status]} />
      </div>

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Moving out</dt>
          <dd className="mt-1 font-medium">
            {formatDate(notice.intended_move_out_date)}
            {live && days >= 0 ? <span className="block text-xs font-normal text-muted-foreground">in {days} day{days === 1 ? "" : "s"}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Deposit held</dt>
          <dd className="mt-1 font-medium">{formatMoney(notice.deposit_held, notice.currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Refund account</dt>
          <dd className="mt-1 font-medium">{notice.refund_account_details ?? <span className="font-normal text-muted-foreground">Not provided</span>}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-xs text-muted-foreground">Reason</dt>
          <dd className="mt-1 whitespace-pre-wrap">{notice.reason}</dd>
        </div>
      </dl>

      {notice.status !== "withdrawn" ? (
        <div className="mt-5 border-t border-border pt-5">
          <VacateStepper notice={notice} currency={notice.currency} viewer="staff" />
        </div>
      ) : null}

      {notice.status !== "withdrawn" ? (
        <div className="mt-5 rounded-xl bg-muted/40 p-4">
          <NoticeActions notice={notice} minLocal={minLocal} />
        </div>
      ) : null}
    </Card>
  );
}

/** Move-out notices for the properties you own or manage: acknowledge, inspect, refund, end the tenancy. */
export async function MoveOutsPage() {
  await requireRole(OPERATOR_ROLES);
  const notices = await listVacateNoticesForStaff();
  const minLocal = nairobiNowLocal(); // earliest inspection time the picker allows
  const groups = [
    { title: "Needs your attention", items: notices.filter((n) => n.status === "submitted") },
    { title: "In progress", items: notices.filter((n) => n.status === "approved" || n.status === "inspection_pending") },
    { title: "Completed", items: notices.filter((n) => n.status === "deposit_refunded" || n.status === "withdrawn") },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Move-outs" description="Tenants who have given notice. Acknowledge it, book the inspection and record the deposit refund." />
      {notices.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No move-out notices" hint="When a tenant gives notice to vacate, it appears here with the next step to take." />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.title}>
              <h2 className="mb-3 text-sm font-semibold">
                {g.title} <span className="font-normal text-muted-foreground">({g.items.length})</span>
              </h2>
              <div className="space-y-4">
                {g.items.map((n) => (
                  <NoticeCard key={n.id} notice={n} minLocal={minLocal} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
