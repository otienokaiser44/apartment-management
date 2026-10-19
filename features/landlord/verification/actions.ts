"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import {
  recordDocument,
  removeDocument,
  startVerification,
  submitVerification,
  withdrawVerification,
} from "@/lib/services/verification";
import { recordDocumentSchema } from "@/lib/validation/verification";

export type ActionResult = { ok: true } | { ok: false; message: string };

const id = z.guid();
const bad = { ok: false, message: "Something went wrong. Reload the page and try again." } as const;
const refresh = (propertyId: string) => revalidatePath(`/landlord/properties/${propertyId}`);

// Verification is the owner's alone: managers and caretakers cannot start or submit it (the RPCs enforce that too).

export async function startVerificationAction(propertyId: string): Promise<ActionResult> {
  await requireRole("landlord");
  if (!id.safeParse(propertyId).success) return bad;
  const r = await startVerification(propertyId);
  if (!r.ok) return r;
  refresh(propertyId);
  return { ok: true };
}

/** Registers a file the browser already put in storage. Takes a plain object so the client can call it directly. */
export async function recordDocumentAction(input: unknown): Promise<ActionResult> {
  await requireRole("landlord");
  const parsed = recordDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? bad.message };
  const r = await recordDocument(parsed.data);
  if (!r.ok) return r;
  refresh(parsed.data.propertyId);
  return { ok: true };
}

export async function removeDocumentAction(propertyId: string, documentId: string): Promise<ActionResult> {
  await requireRole("landlord");
  if (!id.safeParse(propertyId).success || !id.safeParse(documentId).success) return bad;
  const r = await removeDocument(documentId);
  if (!r.ok) return r;
  refresh(propertyId);
  return { ok: true };
}

export async function submitVerificationAction(propertyId: string): Promise<ActionResult> {
  await requireRole("landlord");
  if (!id.safeParse(propertyId).success) return bad;
  const r = await submitVerification(propertyId);
  if (!r.ok) return r;
  refresh(propertyId);
  return { ok: true };
}

export async function withdrawVerificationAction(propertyId: string, requestId: string): Promise<ActionResult> {
  await requireRole("landlord");
  if (!id.safeParse(propertyId).success || !id.safeParse(requestId).success) return bad;
  const r = await withdrawVerification(requestId);
  if (!r.ok) return r;
  refresh(propertyId);
  return { ok: true };
}
