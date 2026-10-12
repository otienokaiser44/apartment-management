"use server";

import { requestPasswordReset, signInForRole, signUpWithRole } from "@/lib/services/auth";
import type { AuthFormState } from "@/types/auth";

// The role is fixed here, on the server. It is never read from the form.
// Registration does not verify the landlord; verification stays admin-controlled.
export async function landlordSignupAction(_prev: AuthFormState, formData: FormData) {
  return signUpWithRole("landlord", formData);
}

export async function landlordLoginAction(_prev: AuthFormState, formData: FormData) {
  return signInForRole("landlord", formData);
}

export async function landlordForgotPasswordAction(_prev: AuthFormState, formData: FormData) {
  return requestPasswordReset(formData);
}
