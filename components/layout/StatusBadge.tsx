import { cn } from "@/components/ui/cn";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Soft tinted background with matching text and a status dot. */
const tones: Record<Tone, { box: string; dot: string }> = {
  success: { box: "bg-success/10 text-success ring-success/20", dot: "bg-success" },
  warning: { box: "bg-warning/10 text-warning ring-warning/25", dot: "bg-warning" },
  danger: { box: "bg-destructive/10 text-destructive ring-destructive/25", dot: "bg-destructive" },
  info: { box: "bg-info/10 text-info ring-info/25", dot: "bg-info" },
  neutral: { box: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground" },
};

const toneOf: Record<string, Tone> = {
  // properties, units, accounts
  verified: "success",
  published: "success",
  vacant: "success",
  active: "success",
  occupied: "info",
  draft: "warning",
  unverified: "warning",
  pending: "warning",
  under_review: "warning",
  reserved: "warning",
  rejected: "danger",
  suspended: "danger",
  cancelled: "neutral",
  archived: "neutral",
  unavailable: "neutral",
  maintenance: "info",
  disabled: "neutral",
  // billing
  paid: "success",
  partially_paid: "warning",
  partial: "warning",
  unpaid: "warning",
  overdue: "danger",
  // maintenance tickets
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
  // priorities
  low: "neutral",
  medium: "warning",
  high: "danger",
  // move-out notices
  submitted: "warning",
  approved: "info",
  inspection_pending: "info",
  deposit_refunded: "success",
  withdrawn: "neutral",
  // announcement categories
  general: "neutral",
  urgent: "danger",
};

/** Friendlier wording than the stored value where the two differ. */
const labelOf: Record<string, string> = {
  general: "General notice",
  urgent: "Urgent alert",
  approved: "Acknowledged",
  inspection_pending: "Inspection scheduled",
  partial: "Partially paid",
};

export function StatusBadge({ status, label: custom, className }: { status: string; label?: string; className?: string }) {
  const t = tones[toneOf[status] ?? "neutral"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", t.box, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
      {custom ?? labelOf[status] ?? label(status)}
    </span>
  );
}
