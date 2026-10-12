import { Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks } from "./NavLinks";
import { UserMenu, type AccountMenuProps } from "./UserMenu";

export type NavItem = { label: string; href: string };

type Props = {
  /** Area label shown next to the brand (e.g. "Landlord"). */
  title: string;
  nav: NavItem[];
  /** When set, the header shows the signed-in user's avatar menu. */
  userEmail?: string | null;
  /** Name, picture, unread count and settings links for the avatar menu. */
  account?: AccountMenuProps;
  children: ReactNode;
};

/** Shared chrome for every product area: sticky header with brand, pill nav and account menu. */
export function RoleShell({ title, nav, userEmail, account, children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Building2 className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold tracking-tight">Keja</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{title}</span>
          </Link>
          <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
            <NavLinks items={nav} label={`${title} navigation`} />
          </div>
          {userEmail !== undefined ? (
            <div className="ml-auto">{userEmail ? <UserMenu email={userEmail} roleLabel={title} account={account} /> : null}</div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
