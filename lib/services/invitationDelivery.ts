import "server-only";
import { headers } from "next/headers";

/** Public site URL. Prefers the configured value over request headers. */
export async function siteBase(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

/** Absolute claim link for a tenant invite token. */
export async function claimUrl(token: string): Promise<string> {
  return `${await siteBase()}/claim-unit?token=${encodeURIComponent(token)}`;
}

/** Absolute link a property manager / caretaker opens to accept a staff invitation. */
export async function staffInviteUrl(token: string): Promise<string> {
  return `${await siteBase()}/staff-invite?token=${encodeURIComponent(token)}`;
}

type Invitation = { unitNumber: string; name: string | null; email: string | null; phone: string | null; claimUrl: string };

/**
 * MOCK delivery. Replace the body with a real email/SMS provider. It deliberately does nothing in production so a
 * claim link (a credential) is never written to server logs there; in development it prints the link.
 */
export async function deliverInvitation(invitation: Invitation): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const to = invitation.email ?? invitation.phone ?? "(no contact)";
  console.info(`[mock invite] unit ${invitation.unitNumber} -> ${to}: ${invitation.claimUrl}`);
}
