import { ROLE_HOME, type Role } from "./roles.ts";

const PROTECTED_AREAS = ["/admin", "/landlord", "/tenant"] as const;

/** Accepts only same-origin absolute paths ("/x"). Rejects "//host", "/\host", schemes and control characters. */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  return value;
}

function isInArea(path: string, area: string) {
  return path === area || path.startsWith(`${area}/`) || path.startsWith(`${area}?`);
}

/**
 * Where to send a user after authenticating. Honors `next` only when it is a safe internal path
 * and not inside another role's protected area; otherwise the role's own home.
 */
export function resolvePostAuthPath(role: Role, next: unknown): string {
  const path = safeInternalPath(next);
  if (!path) return ROLE_HOME[role];
  const foreignArea = PROTECTED_AREAS.some((area) => area !== ROLE_HOME[role] && isInArea(path, area));
  return foreignArea ? ROLE_HOME[role] : path;
}
