import "server-only";
import { createClient as createEphemeralClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import {
  AVATAR_MAX_BYTES, sanitizeMuted, sniffAvatarType, type NotificationCategory, type ProfileInput,
} from "@/lib/validation/account";
import type { SessionUser } from "@/types/auth";
import { failure, type Result } from "./errors";
import { siteBase } from "./invitationDelivery";

/** Like Result, but can point at the form field that caused the failure. */
export type Outcome = { ok: true } | { ok: false; message: string; field?: string };

type AuthError = { code?: string; message: string; status?: number };

/** Supabase Auth errors carry stable `code`s; map the common ones, never echo anything unexpected. */
function authFailure(error: AuthError, fallback: string): { ok: false; message: string; field?: string } {
  switch (error.code) {
    case "same_password":
      return { ok: false, message: "Choose a password you are not already using.", field: "newPassword" };
    case "weak_password":
      return { ok: false, message: "That password is too weak. Use a longer one with letters and numbers.", field: "newPassword" };
    case "email_exists":
    case "email_conflict_identity_not_deletable":
      return { ok: false, message: "That email address is already in use.", field: "email" };
    case "email_address_invalid":
      return { ok: false, message: "Enter a valid email address.", field: "email" };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };
    case "reauthentication_needed":
      return { ok: false, message: "For your security, sign in again and retry." };
    default:
      return { ok: false, message: fallback };
  }
}

// --- reading ------------------------------------------------------------------------------------------------------------------

export type AccountOverview = {
  id: string;
  email: string | null;
  /** An email change that is waiting for confirmation. */
  pendingEmail: string | null;
  role: string;
  status: string;
  createdAt: string | null;
  fullName: string | null;
  phone: string | null;
  avatarPath: string | null;
  businessName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  mutedCategories: NotificationCategory[];
};

export async function getAccountOverview(): Promise<AccountOverview | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const uid = auth.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, avatar_path, role, status, created_at")
    .eq("id", uid)
    .maybeSingle();
  if (!profile) return null;

  let businessName: string | null = null;
  let emergencyContactName: string | null = null;
  let emergencyContactPhone: string | null = null;
  if (profile.role === "landlord") {
    const { data } = await supabase.from("landlord_profiles").select("business_name").eq("user_id", uid).maybeSingle();
    businessName = data?.business_name ?? null;
  } else if (profile.role === "tenant") {
    const { data } = await supabase
      .from("tenant_profiles")
      .select("emergency_contact_name, emergency_contact_phone")
      .eq("user_id", uid)
      .maybeSingle();
    emergencyContactName = data?.emergency_contact_name ?? null;
    emergencyContactPhone = data?.emergency_contact_phone ?? null;
  }

  // Missing until migration 034 is applied: treat as "nothing muted" rather than failing the whole page.
  const { data: prefs } = await supabase.from("notification_preferences").select("muted_categories").eq("user_id", uid).maybeSingle();

  return {
    id: uid,
    email: auth.user.email ?? profile.email ?? null,
    pendingEmail: auth.user.new_email ?? null,
    role: profile.role,
    status: profile.status,
    createdAt: profile.created_at ?? null,
    fullName: profile.full_name ?? null,
    phone: profile.phone ?? null,
    avatarPath: profile.avatar_path ?? null,
    businessName,
    emergencyContactName,
    emergencyContactPhone,
    mutedCategories: sanitizeMuted(prefs?.muted_categories ?? []),
  };
}

/** Everything the shared header needs about the signed-in person. One cheap count query. */
export async function getShellAccount(user: SessionUser, home: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return {
    name: user.fullName,
    avatarVersion: user.avatarPath,
    unread: count ?? 0,
    settingsHref: `${home}/settings`,
    notificationsHref: `${home}/notifications`,
  };
}

// --- profile ------------------------------------------------------------------------------------------------------------------

export async function updateProfile(uid: string, role: string, v: ProfileInput): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: v.fullName, phone: v.phone ?? null }).eq("id", uid);
  if (error) return failure(error, "Could not save your profile.");

  if (role === "landlord") {
    const r = await supabase.from("landlord_profiles").update({ business_name: v.businessName ?? null }).eq("user_id", uid);
    if (r.error) return failure(r.error, "Saved your name, but could not save your business details.");
  } else if (role === "tenant") {
    const r = await supabase
      .from("tenant_profiles")
      .update({ emergency_contact_name: v.emergencyContactName ?? null, emergency_contact_phone: v.emergencyContactPhone ?? null })
      .eq("user_id", uid);
    if (r.error) return failure(r.error, "Saved your name, but could not save your emergency contact.");
  }
  return { ok: true };
}

// --- email / password / sessions --------------------------------------------------------------------------------------------

/**
 * Checks a password WITHOUT touching the caller's session: a separate, non-persisting client signs in and is
 * immediately signed out again. Returns false for any failure so the reason is never revealed.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { url, anonKey } = getSupabaseConfig();
  const probe = createEphemeralClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await probe.auth.signOut().catch(() => undefined);
  return true;
}

/** Starts an email change. Supabase emails a confirmation link; profiles.email follows only once it is confirmed. */
export async function changeEmail(currentEmail: string | null, newEmail: string, settingsPath: string): Promise<Outcome> {
  if (currentEmail && currentEmail.toLowerCase() === newEmail.toLowerCase()) {
    return { ok: false, message: "That is already your email address.", field: "email" };
  }
  const supabase = await createClient();
  const origin = await siteBase();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(settingsPath)}` },
  );
  return error ? authFailure(error, "We could not start the email change. Please try again.") : { ok: true };
}

export async function changePassword(email: string | null, current: string, next: string, signOutOthers: boolean): Promise<Outcome> {
  if (!email || !(await verifyPassword(email, current))) {
    return { ok: false, message: "Your current password is incorrect.", field: "currentPassword" };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return authFailure(error, "We could not change your password. Please try again.");
  if (signOutOthers) await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { ok: true };
}

/** `others` keeps this device signed in; `global` ends every session including this one. */
export async function signOutSessions(scope: "others" | "global"): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope });
  return error ? { ok: false, message: "Could not sign out the other devices. Please try again." } : { ok: true };
}

// --- notifications ----------------------------------------------------------------------------------------------------------------

export async function saveMutedCategories(uid: string, muted: NotificationCategory[]): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: uid, muted_categories: muted }, { onConflict: "user_id" });
  return error ? failure(error, "Could not save your notification settings.") : { ok: true };
}

export type NotificationRow = { id: string; type: string; title: string; body: string | null; created_at: string; read_at: string | null };

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function markAllNotificationsRead(): Promise<Outcome> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  return error ? failure(error, "Could not update your notifications.") : { ok: true };
}

// --- avatar -----------------------------------------------------------------------------------------------------------------------------

export async function uploadAvatar(uid: string, file: File): Promise<Result<{ path: string }>> {
  if (file.size === 0) return { ok: false, message: "Choose an image first." };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, message: "That image is too large (max 1 MB)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffAvatarType(bytes); // by content, never by file name or declared type
  if (!type) return { ok: false, message: "Use a PNG, JPEG or WebP image." };

  const supabase = await createClient();
  const path = `${uid}/${Date.now()}.${type.ext}`;
  const up = await supabase.storage.from("avatars").upload(path, bytes, { contentType: type.mime, upsert: false });
  if (up.error) return { ok: false, message: "Could not upload the image. Please try again." };

  const { data: prev } = await supabase.from("profiles").select("avatar_path").eq("id", uid).maybeSingle();
  const upd = await supabase.from("profiles").update({ avatar_path: path }).eq("id", uid);
  if (upd.error) {
    await supabase.storage.from("avatars").remove([path]);
    return { ok: false, message: "Could not save your picture. Please try again." };
  }
  if (prev?.avatar_path && prev.avatar_path !== path) await supabase.storage.from("avatars").remove([prev.avatar_path]);
  return { ok: true, data: { path } };
}

export async function removeAvatar(uid: string): Promise<Outcome> {
  const supabase = await createClient();
  const { data: prev } = await supabase.from("profiles").select("avatar_path").eq("id", uid).maybeSingle();
  const upd = await supabase.from("profiles").update({ avatar_path: null }).eq("id", uid);
  if (upd.error) return { ok: false, message: "Could not remove your picture." };
  if (prev?.avatar_path) await supabase.storage.from("avatars").remove([prev.avatar_path]);
  return { ok: true };
}

/** The signed-in user's own picture (private bucket, so it is streamed through a route, not linked directly). */
export async function loadMyAvatar(): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("avatar_path").eq("id", auth.user.id).maybeSingle();
  if (!profile?.avatar_path) return null;
  const { data, error } = await supabase.storage.from("avatars").download(profile.avatar_path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = sniffAvatarType(bytes);
  return type ? { bytes, mime: type.mime } : null;
}

// --- privacy ------------------------------------------------------------------------------------------------------------------------------

/** A copy of the data the signed-in user can see about themselves. Anything unreadable is simply left out. */
export async function exportMyData(): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const uid = auth.user.id;

  const rows = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    try {
      const { data, error } = await q;
      return error ? null : data;
    } catch {
      return null;
    }
  };

  const [profile, tenantProfile, landlordProfile, preferences, notifications, tenancies, payments, applications] = await Promise.all([
    rows(supabase.from("profiles").select("id, full_name, email, phone, role, status, created_at").eq("id", uid).maybeSingle()),
    rows(supabase.from("tenant_profiles").select("*").eq("user_id", uid).maybeSingle()),
    rows(supabase.from("landlord_profiles").select("*").eq("user_id", uid).maybeSingle()),
    rows(supabase.from("notification_preferences").select("muted_categories, updated_at").eq("user_id", uid).maybeSingle()),
    rows(supabase.from("notifications").select("id, type, title, body, created_at, read_at").order("created_at", { ascending: false }).limit(1000)),
    rows(supabase.from("tenancies").select("id, unit_id, status, start_date, end_date, monthly_rent, security_deposit, currency, created_at")),
    rows(supabase.from("payments").select("id, tenancy_id, amount, currency, status, payment_method, paid_at, created_at")),
    rows(supabase.from("rental_applications").select("id, unit_id, status, message, created_at")),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: { id: uid, email: auth.user.email ?? null, createdAt: auth.user.created_at ?? null },
    profile,
    tenantProfile,
    landlordProfile,
    notificationPreferences: preferences,
    notifications,
    tenancies,
    payments,
    rentalApplications: applications,
  };
}

/** Verifies the password, closes the account (see the SQL function for what blocks it), then ends every session. */
export async function deactivateMyAccount(email: string | null, password: string): Promise<Outcome> {
  if (!email || !(await verifyPassword(email, password))) {
    return { ok: false, message: "Your password is incorrect.", field: "password" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_my_account");
  if (error) {
    const r = failure(error, "We could not deactivate your account. Please try again.");
    return { ok: false, message: r.message };
  }
  await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  return { ok: true };
}
