import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePostAuthPath, safeInternalPath } from "@/lib/auth/redirects";
import { isRole, LOGIN_PATH, ROLE_HOME } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/** Email confirmation and password-recovery links land here (PKCE `code`, or `token_hash` + `type`). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");
  const audienceParam = searchParams.get("audience");
  const audience = audienceParam === "landlord" || audienceParam === "manager" ? audienceParam : "tenant";

  const supabase = await createClient();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (!ok) return NextResponse.redirect(`${origin}${LOGIN_PATH[audience]}?error=link_invalid`);

  const { data: auth } = await supabase.auth.getUser();
  const { data: profile } = auth.user
    ? await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  const role = profile && isRole(profile.role) ? profile.role : null;

  // The reset page is role-neutral; everything else is constrained to the user's own area.
  const target =
    safeInternalPath(next) === "/auth/reset-password"
      ? "/auth/reset-password"
      : role
        ? resolvePostAuthPath(role, next)
        : ROLE_HOME.visitor;
  return NextResponse.redirect(`${origin}${target}`);
}
