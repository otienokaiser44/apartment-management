import { z } from "zod";
import { sniffAvatarType } from "./account.ts";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

// --- announcements --------------------------------------------------------------------------------------------------------

export const NOTICE_CATEGORIES = ["general", "maintenance", "urgent"] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];
export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  general: "General notice",
  maintenance: "Maintenance",
  urgent: "Urgent alert",
};

// --- maintenance tickets --------------------------------------------------------------------------------------------------

export const MAINTENANCE_CATEGORIES = ["plumbing", "electrical", "carpentry", "general"] as const;
export const MAINTENANCE_PRIORITIES = ["low", "medium", "high"] as const;
export const MAINTENANCE_STATUSES = ["open", "in_progress", "resolved", "closed", "cancelled"] as const;
/** Statuses staff may set (cancelling is the tenant's own action). */
export const STAFF_TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry: "Carpentry",
  general: "General",
};
export const PRIORITY_LABEL: Record<MaintenancePriority, string> = { low: "Low", medium: "Medium", high: "High" };
export const TICKET_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const ticketSchema = z.object({
  tenancyId: z.guid("Choose the home this is about."),
  title: z.string().trim().min(3, "Give the problem a short title (at least 3 characters).").max(120, "Keep the title under 120 characters."),
  category: z.enum(MAINTENANCE_CATEGORIES, { error: "Choose a category." }),
  priority: z.enum(MAINTENANCE_PRIORITIES, { error: "Choose a priority." }),
  description: optText(4000),
});
export type TicketInput = z.infer<typeof ticketSchema>;

export const commentSchema = z.object({
  ticketId: z.guid(),
  message: z.string().trim().min(1, "Write a message first.").max(4000, "Keep it under 4000 characters."),
});

/** Which statuses a ticket may move to next. Mirrors update_maintenance_ticket in the database, which enforces it. */
export const NEXT_TICKET_STATUSES: Record<MaintenanceStatus, (typeof STAFF_TICKET_STATUSES)[number][]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
  cancelled: [],
};

export const staffTicketUpdateSchema = z
  .object({
    ticketId: z.guid(),
    status: z.preprocess(blank, z.enum(STAFF_TICKET_STATUSES).optional()),
    message: optText(4000),
  })
  .refine((v) => v.status || v.message, { path: ["message"], message: "Choose a new status or write a message." });

// --- ticket attachments -------------------------------------------------------------------------------------------------------

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;

export type AttachmentType = { mime: "image/png" | "image/jpeg" | "image/webp" | "application/pdf"; ext: "png" | "jpg" | "webp" | "pdf" };

/** Identifies an attachment by its first bytes (PNG, JPEG, WebP or PDF), never by file name or declared type. */
export function sniffAttachmentType(bytes: Uint8Array): AttachmentType | null {
  const image = sniffAvatarType(bytes);
  if (image) return image;
  // %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  return null;
}

// --- vacate notices --------------------------------------------------------------------------------------------------------------

export const VACATE_STATUSES = ["submitted", "approved", "inspection_pending", "deposit_refunded", "withdrawn"] as const;
export type VacateStatus = (typeof VACATE_STATUSES)[number];

export const VACATE_STATUS_LABEL: Record<VacateStatus, string> = {
  submitted: "Notice submitted",
  approved: "Acknowledged by landlord",
  inspection_pending: "Inspection scheduled",
  deposit_refunded: "Deposit refunded",
  withdrawn: "Withdrawn",
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const todayIso = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10); // Nairobi (UTC+3) calendar day

/** Today's calendar date in Nairobi, as YYYY-MM-DD. */
export const nairobiToday = (now = new Date()) => todayIso(now);

/** "Now" in Nairobi as YYYY-MM-DDTHH:mm, the format (and zone) a datetime-local picker's `min` expects. */
export const nairobiNowLocal = (now = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 16);

/** YYYY-MM-DD plus a number of days. */
export const addDaysIso = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** null when acceptable; otherwise the message to show. The database enforces the same limits. */
export function checkMoveOutDate(value: string, now = new Date()): string | null {
  if (!isoDate.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "Choose your move-out date.";
  const days = dayNumber(value) - dayNumber(todayIso(now));
  if (days < 1) return "Your move-out date must be in the future.";
  if (days > 365) return "Your move-out date cannot be more than a year away.";
  return null;
}

export const vacateSchema = z.object({
  tenancyId: z.guid("We could not tell which tenancy this is for."),
  moveOutDate: z.string().trim().superRefine((v, ctx) => {
    const problem = checkMoveOutDate(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  reason: z.string().trim().min(3, "Tell us why you are leaving (at least 3 characters).").max(2000, "Keep it under 2000 characters."),
  refundDetails: optText(500),
});
export type VacateInput = z.infer<typeof vacateSchema>;

/**
 * `<input type="datetime-local">` has no zone. Landlords and tenants here are in Kenya (UTC+3, no daylight saving),
 * so interpret it as Nairobi time and send an unambiguous ISO instant.
 */
export function nairobiLocalToIso(local: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(local.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:00+03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const money = z.preprocess(blank, z.coerce.number("Enter an amount.").min(0, "Cannot be negative.").max(100_000_000));

export const inspectionSchema = z.object({
  noticeId: z.guid(),
  inspectionAt: z.string().trim().transform((v, ctx) => {
    const iso = nairobiLocalToIso(v);
    if (!iso) {
      ctx.addIssue({ code: "custom", message: "Choose the inspection date and time." });
      return z.NEVER;
    }
    if (Date.parse(iso) <= Date.now()) {
      ctx.addIssue({ code: "custom", message: "The inspection must be in the future." });
      return z.NEVER;
    }
    return iso;
  }),
  note: optText(2000),
});

export const refundSchema = z.object({
  noticeId: z.guid(),
  refundAmount: money,
  deductions: z.preprocess(blank, z.coerce.number("Enter an amount.").min(0, "Cannot be negative.").max(100_000_000).default(0)),
  note: optText(2000),
});

export const acknowledgeSchema = z.object({ noticeId: z.guid(), note: optText(2000) });

// --- statements ---------------------------------------------------------------------------------------------------------------------------

export type StatementStatus = "paid" | "partial" | "unpaid" | "overdue" | "cancelled";

/** What the tenant sees: an unpaid or part-paid invoice past its due date is overdue. */
export function statementStatus(invoiceStatus: "unpaid" | "partial" | "paid" | "cancelled", dueDate: string, now = new Date()): StatementStatus {
  if (invoiceStatus === "paid" || invoiceStatus === "cancelled") return invoiceStatus;
  return dueDate < todayIso(now) ? "overdue" : invoiceStatus;
}
