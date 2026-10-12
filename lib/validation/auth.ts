import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address."));

// Supabase's configured minimum is 8 (supabase/config.toml); bcrypt ignores bytes past 72.
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const fullName = z.string().trim().min(2, "Enter your full name.").max(100);

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\+?[0-9 ()-]{7,20})?$/, "Enter a valid phone number.")
  .optional();

/** NOTE: no `role` field. The role is fixed by which signup route/action is used, never by form input. */
export const signupSchema = z
  .object({ fullName, email, phone, password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(72) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

/** Same strength rules as signup, reused wherever a new password is chosen. */
export const passwordSchema = password;
