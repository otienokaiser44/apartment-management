import Link from "next/link";
import type { ReactNode } from "react";

export type NavItem = { label: string; href: string };

type Props = {
  title: string;
  nav: NavItem[];
  children: ReactNode;
};

/** Shared chrome for every product area. Role layouts pass their own title and nav. */
export function RoleShell({ title, nav, children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-black/10 dark:border-white/15">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">{title}</span>
          <nav aria-label={`${title} navigation`} className="flex gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
