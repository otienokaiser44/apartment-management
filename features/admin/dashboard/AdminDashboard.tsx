import { Building2, DoorOpen, Flag, ShieldCheck, Users, UserSquare2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getDashboardStats, listRecentActivity, listVerificationQueue } from "@/lib/services/admin";
import { formatDate, formatDateTime, humanizeAction } from "../format";

function Stat({ label, value, hint, icon: Icon, href }: { label: string; value: string | number; hint?: string; icon: LucideIcon; href?: string }) {
  const box = "rounded-xl border border-border bg-card p-5 shadow-sm";
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${box} block transition-colors hover:bg-muted/30`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

const MIX: { key: "pending" | "under_review" | "verified" | "rejected" | "suspended"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under review" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
];

export async function AdminDashboard() {
  await requireRole("admin");
  const [stats, queue, activity] = await Promise.all([getDashboardStats(), listVerificationQueue(5), listRecentActivity(8)]);

  return (
    <>
      <PageHeader
        title="Admin dashboard"
        description="Platform health, moderation queue and recent activity."
        actions={
          <Link href="/admin/verification" className={buttonVariants()}>
            <ShieldCheck className="size-4" aria-hidden />
            Review queue{stats.awaitingReview ? ` (${stats.awaitingReview})` : ""}
          </Link>
        }
      />

      <section aria-label="Platform summary" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={UserSquare2} label="Landlords" value={stats.landlords} href="/admin/users?role=landlord" />
        <Stat icon={Users} label="Tenants" value={stats.tenants} href="/admin/users?role=tenant" />
        <Stat icon={Building2} label="Properties" value={stats.properties} hint={`${stats.verification.verified} verified`} href="/admin/properties" />
        <Stat icon={DoorOpen} label="Units" value={stats.units} />
      </section>

      <section aria-label="Verification status" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Property verification</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MIX.map((m) => (
            <div key={m.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <StatusBadge status={m.key} label={m.label} />
              <p className="mt-3 text-2xl font-semibold tabular-nums">{stats.verification[m.key]}</p>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Flag className="size-3.5" aria-hidden />
              Open reports
            </span>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{stats.openReports}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Verification queue">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Waiting for review</h2>
            <Link href="/admin/verification" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              View all
            </Link>
          </div>
          {queue.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Queue is clear" hint="New verification requests from landlords show up here." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
              {queue.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/verification/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.property_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.landlord_name ?? "Unknown landlord"} · submitted {formatDate(r.submitted_at)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent activity">
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Status changes and decisions are recorded here." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{humanizeAction(a.action)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.actor_name ?? "System"} · {a.entity_type.replace(/_/g, " ")}
                    </p>
                  </div>
                  <time dateTime={a.created_at} className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(a.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
