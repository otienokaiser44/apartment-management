import type { NavItem } from "@/components/layout/RoleShell";

/** Add an entry here when a new tenant route is created under app/tenant/. */
export const tenantNav: NavItem[] = [
  { label: "Dashboard", href: "/tenant" },
  { label: "Invoices", href: "/tenant/invoices" },
  { label: "Maintenance", href: "/tenant/tickets" },
  { label: "Notices", href: "/tenant/notices" },
  { label: "Move out", href: "/tenant/vacate" },
  { label: "Settings", href: "/tenant/settings" },
];
