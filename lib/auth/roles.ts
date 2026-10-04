/** Mirrors `profiles.role`. Visitor = no session / no profile row. */
export type Role = "admin" | "landlord" | "tenant";
export type Audience = Role | "visitor";

/** Landing route for each audience. Single source of truth for redirects. */
export const ROLE_HOME: Record<Audience, string> = {
  admin: "/admin",
  landlord: "/landlord",
  tenant: "/tenant",
  visitor: "/visitor",
};
