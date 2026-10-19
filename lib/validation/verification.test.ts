import assert from "node:assert/strict";
import { test } from "node:test";
import { recordDocumentSchema, reviewSchema, sniffVerificationDocType } from "./verification.ts";

const id = "00000000-0000-0000-0000-000000001001";
const other = "00000000-0000-0000-0000-000000001002";

test("review: rejection needs a reason, approval and start-review do not", () => {
  assert.ok(!reviewSchema.safeParse({ requestId: id, decision: "rejected", reason: "   " }).success);
  assert.ok(!reviewSchema.safeParse({ requestId: id, decision: "rejected" }).success);
  assert.ok(reviewSchema.safeParse({ requestId: id, decision: "rejected", reason: "Title deed is unreadable." }).success);
  assert.ok(reviewSchema.safeParse({ requestId: id, decision: "approved" }).success);
  assert.ok(reviewSchema.safeParse({ requestId: id, decision: "under_review", reason: "" }).success);
});

test("review: rejects unknown decisions and malformed ids, trims the reason", () => {
  assert.ok(!reviewSchema.safeParse({ requestId: id, decision: "verified" }).success);
  assert.ok(!reviewSchema.safeParse({ requestId: "nope", decision: "approved" }).success);
  const ok = reviewSchema.safeParse({ requestId: id, decision: "approved", reason: "  looks good  " });
  assert.ok(ok.success);
  assert.equal(ok.data.reason, "looks good");
  assert.ok(!reviewSchema.safeParse({ requestId: id, decision: "approved", reason: "x".repeat(1001) }).success);
});

test("record document: path must sit under the property folder and be a supported file", () => {
  const base = { propertyId: id, requestId: other, documentType: "ownership_proof" };
  assert.ok(recordDocumentSchema.safeParse({ ...base, storagePath: `${id}/abc.pdf` }).success);
  assert.ok(recordDocumentSchema.safeParse({ ...base, storagePath: `${id}/abc.jpg` }).success);
  assert.ok(!recordDocumentSchema.safeParse({ ...base, storagePath: `${other}/abc.pdf` }).success);
  assert.ok(!recordDocumentSchema.safeParse({ ...base, storagePath: `${id}/../${other}/abc.pdf` }).success);
  assert.ok(!recordDocumentSchema.safeParse({ ...base, storagePath: `${id}/abc.exe` }).success);
  assert.ok(!recordDocumentSchema.safeParse({ ...base, documentType: "Bad Type", storagePath: `${id}/abc.pdf` }).success);
});

test("sniff: accepts PDF, PNG and JPEG by content, refuses WebP and anything else", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffVerificationDocType(pdf)?.ext, "pdf");
  assert.equal(sniffVerificationDocType(png)?.ext, "png");
  assert.equal(sniffVerificationDocType(jpg)?.ext, "jpg");
  assert.equal(sniffVerificationDocType(webp), null);
  assert.equal(sniffVerificationDocType(new Uint8Array([1, 2, 3, 4])), null);
});
