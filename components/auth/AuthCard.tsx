import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  /** Page-level notice from a redirect (e.g. an expired confirmation link). */
  notice?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Centered card layout shared by every auth page. */
export function AuthCard({ title, description, notice, children, footer }: Props) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      {notice ? (
        <p role="alert" className="mb-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          {notice}
        </p>
      ) : null}
      {children}
      {footer ? <div className="mt-6 space-y-1 text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}
