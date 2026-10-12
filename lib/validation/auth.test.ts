import assert from "node:assert/strict";
import { test } from "node:test";
import { loginSchema, signupSchema } from "./auth.ts";

const valid = { fullName: "Jane Doe", email: " Jane@Example.com ", password: "abcdefg1", confirmPassword: "abcdefg1" };

test("signup normalizes email and ignores any role field", () => {
  const r = signupSchema.safeParse({ ...valid, role: "admin" });
  assert.ok(r.success);
  assert.equal(r.data.email, "jane@example.com");
  assert.equal("role" in r.data, false);
});

test("signup rejects weak or mismatched passwords", () => {
  assert.ok(!signupSchema.safeParse({ ...valid, password: "short1", confirmPassword: "short1" }).success);
  assert.ok(!signupSchema.safeParse({ ...valid, password: "abcdefgh", confirmPassword: "abcdefgh" }).success);
  assert.ok(!signupSchema.safeParse({ ...valid, confirmPassword: "different1" }).success);
});

test("login requires a valid email and a password", () => {
  assert.ok(!loginSchema.safeParse({ email: "nope", password: "x" }).success);
  assert.ok(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success);
});
