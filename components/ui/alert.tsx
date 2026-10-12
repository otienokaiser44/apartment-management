import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

const styles = {
  error: { box: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertCircle, role: "alert" as const },
  success: { box: "border-success/30 bg-success/10 text-success", icon: CheckCircle2, role: "status" as const },
  info: { box: "border-info/30 bg-info/10 text-info", icon: Info, role: "status" as const },
};

/** Inline message with a status icon. Errors announce as alerts; success/info as status. */
export function Alert({ variant = "info", children, className }: { variant?: keyof typeof styles; children: ReactNode; className?: string }) {
  const s = styles[variant];
  const Icon = s.icon;
  return (
    <div role={s.role} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", s.box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
