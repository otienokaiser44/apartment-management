import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { InviteStaffInput, StaffRole } from "@/lib/validation/staff";
import { failure, type Result } from "./errors";
import { staffInviteUrl } from "./invitationDelivery";

export type StaffMember = {
  staff_id: string;
  property_id: string;
  property_name: string;
  user_id: string;
  role: StaffRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

/** Active staff assignments for the owner's properties (optionally one property). Only owners get rows. */
export async function listStaff(propertyId?: string): Promise<StaffMember[]> {
  const supabase = await createClient();
  let q = supabase
    .from("property_staff_overview")
    .select("staff_id, property_id, property_name, user_id, role, full_name, email, phone")
    .order("property_name")
    .order("full_name");
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data } = await q;
  return (data ?? []) as StaffMember[];
}

export type PendingStaffInvite = { id: string; invitee_email: string; role: StaffRole; property_ids: string[]; expires_at: string };

export async function listPendingStaffInvites(): Promise<PendingStaffInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_invitations")
    .select("id, invitee_email, role, property_ids, expires_at")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []) as PendingStaffInvite[];
}

/** Owner invites a manager/caretaker for one or more properties. The invite link is returned once. */
export async function inviteStaff(v: InviteStaffInput): Promise<Result<{ inviteUrl: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_staff", {
    p_email: v.email,
    p_role: v.role,
    p_property_ids: v.propertyIds,
  });
  if (error) return failure(error, "Could not create the invitation.");
  return { ok: true, data: { inviteUrl: await staffInviteUrl(data as string) } };
}

export async function revokeStaffInvite(invitationId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_staff_invitation", { p_invitation_id: invitationId });
  return error ? failure(error, "Could not revoke the invitation.") : { ok: true, data: undefined };
}

export async function removeStaff(staffId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_staff", { p_staff_id: staffId });
  return error ? failure(error, "Could not remove access.") : { ok: true, data: undefined };
}

/** A manager account redeems the invite token. Returns how many properties were assigned. */
export async function acceptStaffInvite(token: string): Promise<Result<{ properties: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_staff_invitation", { p_token: token });
  if (error) return failure(error, "That invitation is invalid or has expired.");
  return { ok: true, data: { properties: data as number } };
}
