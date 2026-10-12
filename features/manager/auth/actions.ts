"use server";

import { requestPasswordReset, signInForRole, signUpWithRole } from "@/lib/services/auth";
import type { AuthFormState } from "@/types/auth";

// The role is fixed here, on the server. It is never read from the form. A manager account has no access to anything
// until an owner's invitation is accepted.
export async function managerSignupAction(_prev: AuthFormState, formData: FormData) {
  return signUpWithRole("manager", formData);
}

export async function managerLoginAction(_prev: AuthFormState, formData: FormData) {
  return signInForRole("manager", formData);
}

export async function managerForgotPasswordAction(_prev: AuthFormState, formData: FormData) {
  return requestPasswordReset(formData);
}
