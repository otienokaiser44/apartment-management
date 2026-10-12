import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** Elevated container: soft border, rounded-xl, generous padding. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm", className)} {...props} />;
}

/** Card heading with an optional icon tile, description and trailing action. */
export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold leading-6">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
