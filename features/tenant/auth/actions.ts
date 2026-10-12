"use server";

import { requestPasswordReset, signInForRole, signUpWithRole } from "@/lib/services/auth";
import type { AuthFormState } from "@/types/auth";

// The role is fixed here, on the server. It is never read from the form.
export async function tenantSignupAction(_prev: AuthFormState, formData: FormData) {
  return signUpWithRole("tenant", formData);
}

export async function tenantLoginAction(_prev: AuthFormState, formData: FormData) {
  return signInForRole("tenant", formData);
}

export async function tenantForgotPasswordAction(_prev: AuthFormState, formData: FormData) {
  return requestPasswordReset(formData);
}
