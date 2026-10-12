import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { resolvePostAuthPath } from "@/lib/auth/redirects";
import { isRole, ROLE_HOME, type Role, type SignupRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";
import type { AuthFormState } from "@/types/auth";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const invalid = (error: ZodError): AuthFormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors: error.flatten().fieldErrors,
});

const failure = (message: string): AuthFormState => ({ status: "error", message });

async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

/**
 * Registers a user. `role` is chosen by the calling route's action, never by form input. It is passed as
 * signup metadata, which the `handle_new_user` trigger (migration 003) reduces to tenant|landlord and uses to
 * create the profile + extension row. Admin cannot be requested this way.
 */
export async function signUpWithRole(role: SignupRole, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    fullName: text(formData, "fullName"),
    email: text(formData, "email"),
    phone: text(formData, "phone") || undefined,
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { fullName, email, phone, password } = parsed.data;

  const supabase = await createClient();
  const origin = await siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: fullName, ...(phone ? { phone } : {}) },
      emailRedirectTo: `${origin}/auth/callback?audience=${role}&next=${encodeURIComponent(ROLE_HOME[role])}`,
    },
  });
  if (error) return failure("We could not create your account. Please check your details and try again.");

  // Session present => email confirmation is disabled; otherwise the user must confirm first.
  if (data.session) redirect(ROLE_HOME[role]);
  return {
    status: "success",
    message: "Account created. Check your email for a confirmation link, then log in.",
  };
}

/** Signs in and enforces that the account's role matches the login page used. Admins may use any login. */
export async function signInForRole(expected: SignupRole, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error || !data.user) {
    return failure(
      error?.code === "email_not_confirmed"
        ? "Please confirm your email address before logging in."
        : "Incorrect email or password.",
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();
  const role: Role | null = profile && isRole(profile.role) ? profile.role : null;

  if (!role || profile?.status !== "active") {
    await supabase.auth.signOut();
    return failure("This account is not active. Contact support if you think this is a mistake.");
  }
  if (role !== expected && role !== "admin") {
    await supabase.auth.signOut();
    return failure(
      role === "landlord"
        ? "This is a landlord account. Use the landlord login."
        : role === "manager"
          ? "This is a property manager account. Use the manager login."
          : "This is a tenant account. Use the tenant login.",
    );
  }
  redirect(resolvePostAuthPath(role, text(formData, "next")));
}

/** Always reports success so the form cannot be used to discover which emails are registered. */
export async function requestPasswordReset(formData: FormData): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const origin = await siteUrl();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
  });
  return { status: "success", message: "If an account exists for that email, a reset link is on its way." };
}

/** Sets a new password for the current (recovery or normal) session, then sends the user home. */
export async function updatePassword(formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return failure("Your reset link has expired. Request a new one.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failure("We could not update your password. Try again or request a new link.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  redirect(profile && isRole(profile.role) ? ROLE_HOME[profile.role] : ROLE_HOME.visitor);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
