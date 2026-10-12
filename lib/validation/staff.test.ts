import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteStaffSchema, staffTokenSchema } from "./staff.ts";

const id = "00000000-0000-0000-0000-000000001001";

test("invite staff: normalises email, requires role and at least one property", () => {
  const ok = inviteStaffSchema.safeParse({ email: " Mgr@Example.COM ", role: "property_manager", propertyIds: [id] });
  assert.ok(ok.success);
  assert.equal(ok.data.email, "mgr@example.com");
  assert.ok(!inviteStaffSchema.safeParse({ email: "mgr@example.com", role: "owner", propertyIds: [id] }).success);
  assert.ok(!inviteStaffSchema.safeParse({ email: "mgr@example.com", role: "caretaker", propertyIds: [] }).success);
  assert.ok(!inviteStaffSchema.safeParse({ email: "nope", role: "caretaker", propertyIds: [id] }).success);
  assert.ok(!inviteStaffSchema.safeParse({ email: "a@b.co", role: "caretaker", propertyIds: ["not-a-uuid"] }).success);
});

test("staff token: accepts long url-safe tokens only", () => {
  assert.ok(staffTokenSchema.safeParse("a".repeat(64)).success);
  assert.ok(!staffTokenSchema.safeParse("short").success);
  assert.ok(!staffTokenSchema.safeParse("a".repeat(30) + " <b>").success);
});
