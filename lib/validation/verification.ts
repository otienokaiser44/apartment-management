import { z } from "zod";
import { sniffAttachmentType, type AttachmentType } from "./portal.ts";

// --- admin review ----------------------------------------------------------------------------------------------------------------

export const REVIEW_DECISIONS = ["under_review", "approved", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** A rejection must say why: the reason is shown to the landlord and kept in the audit trail. */
export const reviewSchema = z
  .object({
    requestId: z.guid("Invalid request."),
    decision: z.enum(REVIEW_DECISIONS, { error: "Choose a decision." }),
    reason: z.string().trim().max(1000, "Keep the note under 1000 characters.").default(""),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "rejected" && v.reason.length === 0) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Say why this is being rejected." });
    }
  });
export type ReviewInput = z.infer<typeof reviewSchema>;

// --- landlord submission ---------------------------------------------------------------------------------------------------------

/** Mirrors the `verification-documents` bucket limit (10 MB). */
export const VERIFICATION_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_VERIFICATION_DOCS = 10;

/** PDF, PNG, JPEG or WebP, identified by content. The bucket itself allows PDF, JPEG and PNG, so WebP is refused here. */
export function sniffVerificationDocType(bytes: Uint8Array): AttachmentType | null {
  const t = sniffAttachmentType(bytes);
  return t && t.mime !== "image/webp" ? t : null;
}

const DOC_EXT = /\.(pdf|png|jpg)$/;

export const recordDocumentSchema = z
  .object({
    propertyId: z.guid(),
    requestId: z.guid(),
    documentType: z.string().trim().regex(/^[a-z0-9_]+$/, "Choose a document type.").max(60),
    storagePath: z.string().trim().max(300),
  })
  .superRefine((v, ctx) => {
    // Objects live under <property id>/ (the storage policy checks that); refuse anything that tries to climb out of it.
    const ok = v.storagePath.startsWith(`${v.propertyId.toLowerCase()}/`) && !v.storagePath.includes("..") && DOC_EXT.test(v.storagePath);
    if (!ok) ctx.addIssue({ code: "custom", path: ["storagePath"], message: "Invalid file location." });
  });
export type RecordDocumentInput = z.infer<typeof recordDocumentSchema>;

export const REQUEST_STATUS_HINT: Record<string, string> = {
  draft: "Upload your documents, then submit for review.",
  submitted: "Submitted. An administrator will pick this up shortly.",
  under_review: "An administrator is reviewing your documents.",
  approved: "Approved. This property is verified.",
  rejected: "Rejected. Fix the issues below and submit a new request.",
  withdrawn: "You withdrew this request.",
};
