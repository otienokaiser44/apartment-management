import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, type Role } from "@/lib/auth/roles";
import { updateSession } from "@/lib/supabase/proxy";

const PROTECTED: { prefix: string; role: Role }[] = [
  { prefix: "/tenant", role: "tenant" },
  { prefix: "/landlord", role: "landlord" },
  { prefix: "/admin", role: "admin" },
];

/**
 * Refreshes the Supabase session on every matched request and bounces signed-out users away from role
 * dashboards. Role checks happen in the role layouts (lib/auth/session.ts); data access is enforced by RLS.
 */
export async function proxy(request: NextRequest) {
  const { response, signedIn } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const area = PROTECTED.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (area && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH[area.role];
    url.search = `?next=${encodeURIComponent(pathname)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
