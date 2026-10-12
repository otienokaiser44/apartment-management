"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LOGIN_PATH, ROLE_HOME, type Role } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import {
  changeEmail, changePassword, deactivateMyAccount, markAllNotificationsRead, removeAvatar, saveMutedCategories,
  signOutSessions, updateProfile, uploadAvatar, type Outcome,
} from "@/lib/services/account";
import {
  categoriesForRole, deactivateSchema, emailChangeSchema, passwordChangeSchema, profileSchema,
} from "@/lib/validation/account";
import type { FormState } from "@/types/forms";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const invalid = (fieldErrors: FormState["fieldErrors"]): FormState => ({
  status: "error",
  message: "Please fix the highlighted fields.",
  fieldErrors,
});

/** Turns a service outcome into form state, attaching the failure to its field when known. */
const fromOutcome = (r: Outcome, success: string): FormState =>
  r.ok
    ? { status: "success", message: success }
    : { status: "error", message: r.message, fieldErrors: r.field ? { [r.field]: [r.message] } : undefined };

/** Settings live under the person's own area (/tenant, /landlord, /admin); managers share /landlord. */
const settingsRoot = (role: Role) => `${ROLE_HOME[role]}/settings`;

// --- profile ----------------------------------------------------------------------------------------------------------------------

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    fullName: text(formData, "fullName"),
    phone: text(formData, "phone"),
    businessName: text(formData, "businessName"),
    emergencyContactName: text(formData, "emergencyContactName"),
    emergencyContactPhone: text(formData, "emergencyContactPhone"),
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await updateProfile(user.id, user.role, parsed.data);
  if (r.ok) revalidatePath(ROLE_HOME[user.role], "layout"); // the header shows the name
  return fromOutcome(r, "Profile saved.");
}

export async function uploadAvatarAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File)) return { status: "error", message: "Choose an image first." };
  const r = await uploadAvatar(user.id, file);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(ROLE_HOME[user.role], "layout");
  return { status: "success", message: "Profile picture updated." };
}

export async function removeAvatarAction() {
  const user = await requireUser();
  const r = await removeAvatar(user.id);
  if (r.ok) revalidatePath(ROLE_HOME[user.role], "layout");
  return r.ok ? { ok: true, message: "Profile picture removed." } : { ok: false, message: r.message };
}

// --- email / password / sessions ------------------------------------------------------------------------------------------

export async function changeEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = emailChangeSchema.safeParse({ email: text(formData, "email") });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await changeEmail(user.email, parsed.data.email, `${settingsRoot(user.role)}?section=account`);
  if (r.ok) revalidatePath(settingsRoot(user.role));
  return fromOutcome(r, "Check your inbox. We sent a confirmation link; your email changes once you confirm it.");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: text(formData, "currentPassword"),
    newPassword: text(formData, "newPassword"),
    confirmPassword: text(formData, "confirmPassword"),
    signOutOthers: formData.get("signOutOthers") === "on",
  });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await changePassword(user.email, parsed.data.currentPassword, parsed.data.newPassword, parsed.data.signOutOthers);
  return fromOutcome(r, parsed.data.signOutOthers ? "Password changed. Your other devices were signed out." : "Password changed.");
}

export async function signOutOthersAction() {
  await requireUser();
  const r = await signOutSessions("others");
  return r.ok ? { ok: true, message: "Other devices were signed out." } : { ok: false, message: r.message };
}

export async function signOutEverywhereAction() {
  const user = await requireUser();
  const r = await signOutSessions("global");
  if (!r.ok) return { ok: false, message: r.message };
  redirect(`${LOGIN_PATH[user.role]}?error=signed_out_everywhere`);
}

// --- notifications -------------------------------------------------------------------------------------------------------------

/** A checked box means "send me these"; anything unchecked (and relevant to the role) is muted. */
export async function saveNotificationPrefsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const enabled = new Set(formData.getAll("enabled").filter((v): v is string => typeof v === "string"));
  const muted = categoriesForRole(user.role).filter((c) => !enabled.has(c));
  const r = await saveMutedCategories(user.id, muted);
  return fromOutcome(r, "Notification settings saved.");
}

export async function markAllReadAction() {
  const user = await requireUser();
  const r = await markAllNotificationsRead();
  if (r.ok) revalidatePath(ROLE_HOME[user.role], "layout");
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

// --- privacy ------------------------------------------------------------------------------------------------------------------------

export async function deactivateAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = deactivateSchema.safeParse({ password: text(formData, "password"), confirmation: text(formData, "confirmation") });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const r = await deactivateMyAccount(user.email, parsed.data.password);
  if (!r.ok) return fromOutcome(r, "");
  redirect(`${LOGIN_PATH[user.role]}?error=deactivated`);
}
