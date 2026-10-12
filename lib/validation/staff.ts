import { z } from "zod";

export const STAFF_ROLES = ["property_manager", "caretaker"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  property_manager: "Property Manager",
  caretaker: "Caretaker",
};

/** What each role can do. Shown in the invite form; enforced by the database, not by this text. */
export const STAFF_ROLE_HELP: Record<StaffRole, string> = {
  property_manager: "Runs day-to-day operations: units, tenants, requests, meter readings, invoices, payments and announcements.",
  caretaker: "Read-only: can see the assigned properties and their units.",
};

export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  role: z.enum(STAFF_ROLES, { error: "Choose a role." }),
  propertyIds: z.array(z.guid()).min(1, "Choose at least one property.").max(50),
});
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

/** Invitation tokens are 64 hex characters. Accept only that shape before calling the database. */
export const staffTokenSchema = z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/);
