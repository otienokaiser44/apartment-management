"use server";

import { updatePassword } from "@/lib/services/auth";
import type { AuthFormState } from "@/types/auth";

/** Shared by both roles: the reset-password page is role-neutral. */
export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return updatePassword(formData);
}
