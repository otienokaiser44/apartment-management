import { Clock, DoorOpen, FileCheck2, KeyRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { requireRole } from "@/lib/auth/session";
import { listMyVacateNotices } from "@/lib/services/moveouts";
import { getMyTenancies } from "@/lib/services/tenant";
import { VACATE_STATUS_LABEL, addDaysIso, nairobiToday } from "@/lib/validation/portal";
import { VacateForm } from "./VacateForm";
import { VacateTracker } from "./VacateTracker";

const OPEN = ["submitted", "approved", "inspection_pending"];

const NEXT_STEPS: { icon: LucideIcon; title: string; hint: string }[] = [
  { icon: FileCheck2, title: "Your landlord acknowledges", hint: "You are notified as soon as they do." },
  { icon: Clock, title: "A move-out inspection is booked", hint: "You will see the date and time here." },
  { icon: KeyRound, title: "You hand back the keys", hint: "Your deposit is refunded after the inspection." },
];

/** Give formal notice, then follow the landlord's acknowledgement, the inspection and the deposit refund. */
export async function VacatePage() {
  await requireRole("tenant");
  const [tenancies, notices] = await Promise.all([getMyTenancies(), listMyVacateNotices()]);
  const active = tenancies.find((t) => t.tenancy_status === "active");
  const open = notices.find((n) => OPEN.includes(n.status));
  const history = notices.filter((n) => n !== open);
  const today = nairobiToday();

  return (
    <>
      <PageHeader title="Move out" description="Tell your landlord you are leaving and track your deposit refund." />

      {!active && !open ? (
        <EmptyState
          icon={DoorOpen}
          title="No active tenancy"
          hint="You can give a move-out notice once you are living in a home on this platform."
          action={
            <Link href="/tenant" className={buttonVariants()}>
              Go to dashboard
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {active ? (
            <p className="text-sm text-muted-foreground">
              {active.property_name} · Unit {active.unit_number} · deposit {formatMoney(active.security_deposit, active.currency)}
            </p>
          ) : null}

          {open ? (
            <VacateTracker notice={open} currency={active?.currency ?? "KES"} />
          ) : active ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <Card>
                <CardHeader icon={DoorOpen} title="Give notice to vacate" description="This is a formal notice to your landlord." />
                <VacateForm tenancyId={active.tenancy_id} minDate={addDaysIso(today, 1)} maxDate={addDaysIso(today, 365)} />
              </Card>
              <Card>
                <CardHeader title="What happens next" />
                <ol className="space-y-4 text-sm">
                  {NEXT_STEPS.map(({ icon: Icon, title, hint }) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span>
                        <span className="block font-medium">{title}</span>
                        <span className="text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          ) : null}

          {history.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Earlier notices</h2>
              <ul className="space-y-2">
                {history.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
                    <span>
                      Move-out {formatDate(n.intended_move_out_date)}
                      <span className="block text-xs text-muted-foreground">
                        Sent {formatDate(n.created_at)}
                        {n.status === "deposit_refunded" ? ` · refunded ${formatMoney(n.refund_amount, active?.currency ?? "KES")}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={n.status} label={VACATE_STATUS_LABEL[n.status]} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
