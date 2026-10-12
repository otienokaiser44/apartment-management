"use client";

import { Bell, ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";

export type AccountMenuProps = {
  name: string | null;
  /** Stored picture path; only used as a cache-busting version for /account/avatar. */
  avatarVersion: string | null;
  unread: number;
  settingsHref: string;
  notificationsHref: string;
};

const item =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Avatar button with a dropdown: who is signed in, Settings, Notifications and Sign out. */
export function UserMenu({ email, roleLabel, account }: { email: string; roleLabel: string; account?: AccountMenuProps }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = account?.name ?? email;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = account?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 transition-colors hover:bg-muted"
      >
        <Avatar label={label} version={account?.avatarVersion} className="size-7 text-xs" />
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden /> : null}
        <span className="sr-only">Account menu{unread > 0 ? `, ${unread} unread notifications` : ""}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar label={label} version={account?.avatarVersion} className="size-10 text-sm" />
            <div className="min-w-0">
              {account?.name ? <p className="truncate text-sm font-medium">{account.name}</p> : null}
              <p className={`truncate ${account?.name ? "text-xs text-muted-foreground" : "text-sm font-medium"}`}>{email}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <div className="p-1">
            {account ? (
              <>
                <Link href={account.settingsHref} role="menuitem" className={item} onClick={() => setOpen(false)}>
                  <Settings className="size-4" aria-hidden />
                  Settings
                </Link>
                <Link href={account.notificationsHref} role="menuitem" className={item} onClick={() => setOpen(false)}>
                  <Bell className="size-4" aria-hidden />
                  Notifications
                  {unread > 0 ? (
                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{unread > 99 ? "99+" : unread}</span>
                  ) : null}
                </Link>
                <div className="my-1 border-t border-border" role="separator" />
              </>
            ) : null}
            <form action="/auth/signout" method="post">
              <button type="submit" role="menuitem" className={item}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
