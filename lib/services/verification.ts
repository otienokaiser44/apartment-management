import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RecordDocumentInput } from "@/lib/validation/verification";
import { failure, type Result } from "./errors";

export type DocumentType = { code: string; label: string; description: string | null; is_required: boolean };

export type MyVerificationDocument = {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  storage_path: string;
  created_at: string;
};

export type MyVerificationRequest = {
  id: string;
  status: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  documents: MyVerificationDocument[];
};

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("verification_document_types").select("code, label, description, is_required").order("is_required", { ascending: false }).order("label");
  return (data ?? []) as DocumentType[];
}

/** The newest request for a property (draft, in review or decided) with its documents. Null if none was ever started. */
export async function getLatestRequest(propertyId: string): Promise<MyVerificationRequest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_verification_requests")
    .select("id, status, rejection_reason, admin_notes, submitted_at, reviewed_at, created_at")
    .eq("property_id", propertyId)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const req = data as Omit<MyVerificationRequest, "documents">;
  const { data: docs } = await supabase
    .from("property_verification_documents")
    .select("id, document_type, status, rejection_reason, storage_path, created_at")
    .eq("verification_request_id", req.id)
    .order("created_at");
  return { ...req, documents: (docs ?? []) as MyVerificationDocument[] };
}

/** Opens (or returns the existing) draft request. */
export async function startVerification(propertyId: string): Promise<Result<{ requestId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_property_verification", { p_property_id: propertyId });
  if (error) return failure(error, "Could not start verification.");
  return { ok: true, data: { requestId: data as string } };
}

/** Registers a file the browser already uploaded. Only allowed by RLS while the request is still a draft. */
export async function recordDocument(v: RecordDocumentInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("property_verification_documents")
    .insert({ verification_request_id: v.requestId, document_type: v.documentType, storage_path: v.storagePath });
  return error ? failure(error, "Could not save the document.") : { ok: true, data: undefined };
}

export async function removeDocument(documentId: string): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.from("property_verification_documents").select("storage_path").eq("id", documentId).maybeSingle();
  const { error } = await supabase.from("property_verification_documents").delete().eq("id", documentId);
  if (error) return failure(error, "Could not remove the document.");
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await supabase.storage.from("verification-documents").remove([path]);
  return { ok: true, data: undefined };
}

export async function submitVerification(propertyId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_property_verification", { p_property_id: propertyId });
  return error ? failure(error, "Could not submit for review.") : { ok: true, data: undefined };
}

export async function withdrawVerification(requestId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_property_verification", { p_request_id: requestId });
  return error ? failure(error, "Could not withdraw the request.") : { ok: true, data: undefined };
}
