import type { AuthField } from "@/components/auth/AuthForm";

/** Field definitions shared by the tenant and landlord auth forms so they never drift apart. */
export const emailField: AuthField = { name: "email", label: "Email", type: "email", autoComplete: "email" };

export const loginFields: AuthField[] = [
  emailField,
  { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
];

export const signupFields: AuthField[] = [
  { name: "fullName", label: "Full name", type: "text", autoComplete: "name" },
  emailField,
  { name: "phone", label: "Phone (optional)", type: "tel", autoComplete: "tel", required: false },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
    hint: "At least 8 characters, with a letter and a number.",
  },
  { name: "confirmPassword", label: "Confirm password", type: "password", autoComplete: "new-password" },
];

export const resetFields: AuthField[] = signupFields.filter((f) => f.name.toLowerCase().includes("password"));

const NOTICES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Request a new one.",
  deactivated: "Your account was deactivated. Contact support if you want it reactivated.",
  signed_out_everywhere: "You were signed out on all devices. Log in again to continue.",
};

export const authNotice = (code: string | undefined) => (code ? NOTICES[code] : undefined);
