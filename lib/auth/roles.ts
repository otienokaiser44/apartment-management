/** Mirrors `profiles.role`. Visitor = no session / no profile row. */
export type Role = "admin" | "landlord" | "tenant" | "manager";
export type Audience = Role | "visitor";

/**
 * Landing route for each audience. Single source of truth for redirects.
 * Managers (property managers and caretakers) work inside the landlord area; what they can reach is limited per
 * property by the database (property_staff + RLS), not by the URL.
 */
export const ROLE_HOME: Record<Audience, string> = {
  admin: "/admin",
  landlord: "/landlord",
  tenant: "/tenant",
  manager: "/landlord",
  visitor: "/visitor",
};

/** Roles that can register publicly. `admin` is provisioned only by scripts/create-admin.mjs. */
export type SignupRole = Exclude<Role, "admin">;

/** Login page for each role. Admins have no dedicated page; they sign in through the tenant login. */
export const LOGIN_PATH: Record<Role, string> = {
  tenant: "/auth/tenant/login",
  landlord: "/auth/landlord/login",
  manager: "/auth/manager/login",
  admin: "/auth/tenant/login",
};

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "landlord" || value === "tenant" || value === "manager";
}

/** Roles that may use the landlord area: the owner and delegated managers/caretakers. */
export const OPERATOR_ROLES: readonly Role[] = ["landlord", "manager"];
