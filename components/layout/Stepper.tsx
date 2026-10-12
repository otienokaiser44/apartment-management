import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type Step = {
  key: string;
  label: string;
  /** Extra detail shown under the label (a date, an amount ...). */
  detail?: ReactNode;
  state: "done" | "current" | "todo";
};

/** A progress tracker: vertical on phones, a row of numbered steps on wider screens. */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-4 md:grid-flow-col md:auto-cols-fr md:gap-3">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 md:flex-col md:gap-2" aria-current={s.state === "current" ? "step" : undefined}>
          <div className="flex items-center gap-3 md:w-full">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                s.state === "done" && "border-primary bg-primary text-primary-foreground",
                s.state === "current" && "border-primary bg-accent text-accent-foreground ring-4 ring-primary/15",
                s.state === "todo" && "border-border bg-card text-muted-foreground",
              )}
            >
              {s.state === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            {i < steps.length - 1 ? (
              <span className={cn("hidden h-px flex-1 md:block", s.state === "done" ? "bg-primary" : "bg-border")} aria-hidden />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className={cn("text-sm font-medium", s.state === "todo" && "text-muted-foreground")}>{s.label}</p>
            {s.detail ? <div className="text-xs text-muted-foreground">{s.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
