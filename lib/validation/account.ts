import { z } from "zod";
import { passwordSchema } from "./auth.ts";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const phoneField = z.preprocess(
  blank,
  z.string().trim().max(20).regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.").optional(),
);

/** Fields every account has, plus the role-specific extras (ignored for roles that do not use them). */
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  phone: phoneField,
  businessName: optText(120),
  emergencyContactName: optText(100),
  emergencyContactPhone: phoneField,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const emailChangeSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(72),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
    signOutOthers: z.boolean(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password you are not already using." });

export const deactivateSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm.").max(72),
  confirmation: z.literal("DEACTIVATE", { error: "Type DEACTIVATE to confirm." }),
});

// --- notification preferences -----------------------------------------------------------------------------------------

export const NOTIFICATION_CATEGORIES = ["announcements", "billing", "tenancy", "maintenance", "staff"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

type Audience = "tenant" | "landlord" | "manager" | "admin";

export const NOTIFICATION_CATEGORY_INFO: Record<NotificationCategory, { label: string; description: string; roles: Audience[] }> = {
  announcements: {
    label: "Announcements",
    description: "Notices your landlord or manager sends to your building.",
    roles: ["tenant"],
  },
  billing: {
    label: "Billing & payments",
    description: "New invoices and payment confirmations.",
    roles: ["tenant", "landlord", "manager"],
  },
  tenancy: {
    label: "Tenancy & requests",
    description: "Invitations, link requests, approvals and tenancy changes.",
    roles: ["tenant", "landlord", "manager"],
  },
  maintenance: {
    label: "Maintenance",
    description: "Updates on repair tickets, or new tickets raised by tenants.",
    roles: ["tenant", "landlord", "manager"],
  },
  staff: {
    label: "Team",
    description: "Managers and caretakers joining or leaving your properties.",
    roles: ["landlord", "manager"],
  },
};

export const categoriesForRole = (role: string): NotificationCategory[] =>
  NOTIFICATION_CATEGORIES.filter((c) => (NOTIFICATION_CATEGORY_INFO[c].roles as string[]).includes(role));

/** Keeps only known categories, de-duplicated. Anything else is dropped rather than trusted. */
export const sanitizeMuted = (values: unknown[]): NotificationCategory[] =>
  [...new Set(values.filter((v): v is NotificationCategory => (NOTIFICATION_CATEGORIES as readonly unknown[]).includes(v)))];

// --- avatar uploads ---------------------------------------------------------------------------------------------------------

export const AVATAR_MAX_BYTES = 1_000_000; // stays under the default Server Action body limit (1 MB)

export type AvatarType = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Identifies an image by its first bytes, never by its filename or declared type. SVG and everything else is refused. */
export function sniffAvatarType(bytes: Uint8Array): AvatarType | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return { mime: "image/png", ext: "png" };
  }
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  // RIFF....WEBP
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}
