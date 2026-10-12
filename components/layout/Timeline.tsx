import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";

export type TimelineEvent = {
  id: string;
  /** Who did it, e.g. "You", "Landlord", "Caretaker". */
  actor: string;
  /** What happened, e.g. "changed the status to In progress". */
  text: ReactNode;
  at: string;
  /** Optional message body shown under the line. */
  body?: string | null;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "info" | "warning" | "danger";
};

const dot: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
};

/** A vertical activity feed: a line of dots with who/what/when and an optional message. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
      {events.map((e) => {
        const Icon = e.icon;
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", dot[e.tone ?? "neutral"])}>
              {Icon ? <Icon className="size-4" aria-hidden /> : <span className="size-2 rounded-full bg-current" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm">
                <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.text}</span>
              </p>
              <time dateTime={e.at} className="text-xs text-muted-foreground">
                {formatDateTime(e.at)}
              </time>
              {e.body ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm">{e.body}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
