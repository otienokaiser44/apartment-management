"use client";

import { Bell, Save } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { NOTIFICATION_CATEGORY_INFO, categoriesForRole, type NotificationCategory } from "@/lib/validation/account";
import { initialFormState } from "@/types/forms";
import { saveNotificationPrefsAction } from "../actions";

/** In-app notification categories. A checked box means "notify me". */
export function NotificationsSection({ role, muted, inboxHref }: { role: string; muted: NotificationCategory[]; inboxHref: string }) {
  const [state, action, pending] = useActionState(saveNotificationPrefsAction, initialFormState);
  const categories = categoriesForRole(role);

  return (
    <Card>
      <CardHeader
        icon={Bell}
        title="Notifications"
        description="Choose which in-app notifications you receive."
        action={
          <Link href={inboxHref} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Open inbox
          </Link>
        }
      />
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no notification categories for your account type.</p>
      ) : (
        <form action={action} className="space-y-5">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {categories.map((c) => {
              const info = NOTIFICATION_CATEGORY_INFO[c];
              return (
                <li key={c}>
                  <label className="flex cursor-pointer items-start justify-between gap-4 p-4">
                    <span>
                      <span className="block text-sm font-medium">{info.label}</span>
                      <span className="block text-xs text-muted-foreground">{info.description}</span>
                    </span>
                    <input type="checkbox" name="enabled" value={c} defaultChecked={!muted.includes(c)} className="mt-1 size-5 shrink-0 accent-primary" aria-label={`Notify me about ${info.label}`} />
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Important account and security messages are always delivered. Announcements you turn off here still appear on your dashboard. Email and SMS delivery is not available yet.
          </p>
          {state.message ? <Alert variant={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
          <Button type="submit" icon={Save} loading={pending} loadingText="Saving…">
            Save preferences
          </Button>
        </form>
      )}
    </Card>
  );
}
