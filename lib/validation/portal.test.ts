import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkMoveOutDate, commentSchema, inspectionSchema, nairobiLocalToIso, refundSchema, sniffAttachmentType, staffTicketUpdateSchema,
  statementStatus, ticketSchema, vacateSchema,
} from "./portal.ts";

const guid = "00000000-0000-0000-0000-000000003001";

test("ticket: title, category and priority are required; blanks become undefined", () => {
  const ok = ticketSchema.safeParse({ tenancyId: guid, title: "  Leaking sink ", category: "plumbing", priority: "high", description: "" });
  assert.ok(ok.success);
  assert.equal(ok.data.title, "Leaking sink");
  assert.equal(ok.data.description, undefined);
  assert.ok(!ticketSchema.safeParse({ tenancyId: guid, title: "x", category: "plumbing", priority: "high" }).success);
  assert.ok(!ticketSchema.safeParse({ tenancyId: guid, title: "Leak", category: "gardening", priority: "high" }).success);
  assert.ok(!ticketSchema.safeParse({ tenancyId: guid, title: "Leak", category: "plumbing", priority: "urgent" }).success);
  assert.ok(!ticketSchema.safeParse({ tenancyId: "nope", title: "Leak", category: "plumbing", priority: "low" }).success);
});

test("comments and staff updates", () => {
  assert.ok(commentSchema.safeParse({ ticketId: guid, message: "  hello " }).success);
  assert.ok(!commentSchema.safeParse({ ticketId: guid, message: "   " }).success);
  assert.ok(staffTicketUpdateSchema.safeParse({ ticketId: guid, status: "in_progress", message: "" }).success);
  assert.ok(staffTicketUpdateSchema.safeParse({ ticketId: guid, status: "", message: "On it" }).success);
  assert.ok(!staffTicketUpdateSchema.safeParse({ ticketId: guid, status: "", message: "" }).success);
  assert.ok(!staffTicketUpdateSchema.safeParse({ ticketId: guid, status: "cancelled" }).success);
});

test("attachments are identified by content", () => {
  assert.equal(sniffAttachmentType(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))?.mime, "application/pdf");
  assert.equal(sniffAttachmentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1]))?.mime, "image/jpeg");
  assert.equal(sniffAttachmentType(new TextEncoder().encode("<script>alert(1)</script>")), null);
  assert.equal(sniffAttachmentType(new TextEncoder().encode("MZ executable")), null);
});

test("move-out date: must be tomorrow or later, at most a year away (Nairobi calendar day)", () => {
  const now = new Date("2026-10-12T10:00:00Z"); // 13:00 in Nairobi, still 12 Oct
  assert.equal(checkMoveOutDate("2026-10-13", now), null);
  assert.equal(checkMoveOutDate("2027-10-12", now), null);
  assert.match(checkMoveOutDate("2026-10-12", now) ?? "", /future/);
  assert.match(checkMoveOutDate("2026-10-01", now) ?? "", /future/);
  assert.match(checkMoveOutDate("2027-10-13", now) ?? "", /year/);
  assert.match(checkMoveOutDate("", now) ?? "", /Choose/);
  assert.match(checkMoveOutDate("12/10/2026", now) ?? "", /Choose/);
  // 22:30 UTC is already 13 Oct in Nairobi, so 13 Oct is no longer "future"
  assert.match(checkMoveOutDate("2026-10-13", new Date("2026-10-12T22:30:00Z")) ?? "", /future/);
});

test("vacate form: date, reason and optional refund details", () => {
  const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  const ok = vacateSchema.safeParse({ tenancyId: guid, moveOutDate: future, reason: "Relocating", refundDetails: "" });
  assert.ok(ok.success);
  assert.equal(ok.data.refundDetails, undefined);
  assert.ok(!vacateSchema.safeParse({ tenancyId: guid, moveOutDate: "", reason: "Relocating" }).success);
  assert.ok(!vacateSchema.safeParse({ tenancyId: guid, moveOutDate: future, reason: "x" }).success);
});

test("datetime-local is read as Nairobi time", () => {
  assert.equal(nairobiLocalToIso("2026-11-02T09:30"), "2026-11-02T09:30:00+03:00");
  assert.equal(nairobiLocalToIso("garbage"), null);
  assert.equal(Date.parse(nairobiLocalToIso("2026-11-02T09:30") as string), Date.parse("2026-11-02T06:30:00Z"));
});

test("inspection must be a future time; refund amounts must be sane", () => {
  const future = new Date(Date.now() + 5 * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 16);
  assert.ok(inspectionSchema.safeParse({ noticeId: guid, inspectionAt: future, note: "" }).success);
  assert.ok(!inspectionSchema.safeParse({ noticeId: guid, inspectionAt: "2020-01-01T10:00" }).success);
  assert.ok(!inspectionSchema.safeParse({ noticeId: guid, inspectionAt: "" }).success);
  const r = refundSchema.safeParse({ noticeId: guid, refundAmount: "800", deductions: "", note: "" });
  assert.ok(r.success);
  assert.equal(r.data.deductions, 0);
  assert.ok(!refundSchema.safeParse({ noticeId: guid, refundAmount: "-1", deductions: "" }).success);
  assert.ok(!refundSchema.safeParse({ noticeId: guid, refundAmount: "", deductions: "" }).success);
});

test("statement status: unpaid past its due date is overdue", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  assert.equal(statementStatus("paid", "2026-09-05", now), "paid");
  assert.equal(statementStatus("unpaid", "2026-10-20", now), "unpaid");
  assert.equal(statementStatus("unpaid", "2026-10-05", now), "overdue");
  assert.equal(statementStatus("partial", "2026-10-05", now), "overdue");
  assert.equal(statementStatus("partial", "2026-10-20", now), "partial");
  assert.equal(statementStatus("unpaid", "2026-10-12", now), "unpaid");
  assert.equal(statementStatus("cancelled", "2020-01-01", now), "cancelled");
});
