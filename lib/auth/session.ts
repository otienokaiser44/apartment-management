import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/types/auth";
import { isRole, LOGIN_PATH, ROLE_HOME, type Role } from "./roles";

/** Verified user (JWT validated with the Auth server) plus their role from `profiles`. Null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, full_name, avatar_path")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || !isRole(profile.role)) return null;

  return {
    id: auth.user.id,
    email: auth.user.email ?? null,
    role: profile.role,
    status: profile.status,
    fullName: profile.full_name ?? null,
    avatarPath: profile.avatar_path ?? null,
  };
}

/**
 * Server-side guard for role layouts/pages. UX only: RLS remains the real boundary.
 * Signed out -> that role's login page; wrong role or suspended -> their own home / public area.
 */
export async function requireRole(role: Role | readonly Role[]): Promise<SessionUser> {
  const allowed = Array.isArray(role) ? (role as readonly Role[]) : [role as Role];
  const primary = allowed[0];
  const user = await getSessionUser();
  if (!user) redirect(`${LOGIN_PATH[primary]}?next=${encodeURIComponent(ROLE_HOME[primary])}`);
  if (user.status !== "active") redirect(ROLE_HOME.visitor);
  if (!allowed.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** Any signed-in, active account (every role). For account-level features such as settings. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(LOGIN_PATH.tenant);
  if (user.status !== "active") redirect(ROLE_HOME.visitor);
  return user;
}
