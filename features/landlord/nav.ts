import type { NavItem } from "@/components/layout/RoleShell";
import type { Role } from "@/lib/auth/roles";

/** Add an entry here when a new landlord route is created under app/landlord/. */
export const landlordNav: NavItem[] = [
  { label: "Dashboard", href: "/landlord" },
  { label: "Properties", href: "/landlord/properties" },
  { label: "Tenants", href: "/landlord/tenants" },
  { label: "Maintenance", href: "/landlord/maintenance" },
  { label: "Move-outs", href: "/landlord/move-outs" },
  { label: "Billing", href: "/landlord/billing" },
  { label: "Announcements", href: "/landlord/announcements" },
  { label: "Managers", href: "/landlord/managers" },
];

/** Managers and caretakers use the same area without the owner-only "Managers" page. */
export const managerNav: NavItem[] = landlordNav.filter((i) => i.href !== "/landlord/managers");

export const navForRole = (role: Role): NavItem[] => (role === "manager" ? managerNav : landlordNav);
