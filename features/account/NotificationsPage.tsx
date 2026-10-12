import { Bell, CheckCheck, Settings } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/forms/ActionButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ROLE_HOME } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listNotifications } from "@/lib/services/account";
import { markAllReadAction } from "./actions";

/** The signed-in person's in-app notifications, newest first. */
export async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(50);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You are all caught up."}
        actions={
          <>
            <Link href={`${ROLE_HOME[user.role]}/settings?section=notifications`} className={buttonVariants({ variant: "secondary" })}>
              <Settings className="size-4" aria-hidden />
              Preferences
            </Link>
            {unread ? <ActionButton label="Mark all as read" action={markAllReadAction} /> : null}
          </>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" hint="Invitations, requests, invoices and other updates will show up here." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 shadow-sm",
                n.read_at ? "border-border bg-card" : "border-primary/30 bg-accent/60",
              )}
            >
              <span className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg", n.read_at ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")}>
                {n.read_at ? <CheckCheck className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <time dateTime={n.created_at} className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </time>
                </div>
                {n.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
