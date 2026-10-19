import type { NavItem } from "@/components/layout/RoleShell";

/** Add an entry here when a new admin route is created under app/admin/. */
export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Properties", href: "/admin/properties" },
  { label: "Users", href: "/admin/users" },
  { label: "Verification", href: "/admin/verification" },
];
