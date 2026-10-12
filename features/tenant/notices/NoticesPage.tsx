import { Megaphone } from "lucide-react";
import { ActionButton } from "@/components/forms/ActionButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/lib/auth/session";
import { listMyAnnouncements, type TenantAnnouncement } from "@/lib/services/billing";
import { NOTICE_CATEGORY_LABEL } from "@/lib/validation/portal";
import { markNoticeReadAction } from "./actions";

/** One announcement as a card: category badge, title, time, message and a read state. */
export function NoticeCard({ notice }: { notice: TenantAnnouncement }) {
  const urgent = notice.category === "urgent";
  return (
    <article
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        urgent ? "border-destructive/40 bg-destructive/5" : notice.read ? "border-border bg-card" : "border-primary/30 bg-accent/50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={notice.category} label={NOTICE_CATEGORY_LABEL[notice.category]} />
          {!notice.read ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">New</span> : null}
        </div>
        <time dateTime={notice.created_at} className="text-xs text-muted-foreground">
          {formatDateTime(notice.created_at)}
        </time>
      </div>
      <h3 className="mt-3 font-medium">{notice.title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{notice.body}</p>
      {!notice.read ? (
        <div className="mt-3">
          <ActionButton label="Mark as read" action={markNoticeReadAction.bind(null, notice.id)} />
        </div>
      ) : null}
    </article>
  );
}

/** Everything your landlord or manager has broadcast to your building, newest first. */
export async function NoticesPage() {
  await requireRole("tenant");
  const notices = await listMyAnnouncements(50);
  const unread = notices.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader title="Notices & alerts" description={unread ? `${unread} unread` : "Announcements from your landlord and property manager."} />
      {notices.length === 0 ? (
        <EmptyState icon={Megaphone} title="No notices yet" hint="Announcements, maintenance schedules and urgent alerts for your building will appear here." />
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <NoticeCard key={n.id} notice={n} />
          ))}
        </div>
      )}
    </>
  );
}
