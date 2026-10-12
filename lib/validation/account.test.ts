import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoriesForRole, deactivateSchema, emailChangeSchema, passwordChangeSchema, profileSchema, sanitizeMuted, sniffAvatarType,
} from "./account.ts";

test("profile: requires a name, treats blanks as not provided, validates phones", () => {
  const ok = profileSchema.safeParse({ fullName: "  Jane Doe ", phone: "", businessName: "", emergencyContactName: "Sam", emergencyContactPhone: "+254 700 000 000" });
  assert.ok(ok.success);
  assert.equal(ok.data.fullName, "Jane Doe");
  assert.equal(ok.data.phone, undefined);
  assert.equal(ok.data.businessName, undefined);
  assert.ok(!profileSchema.safeParse({ fullName: "J" }).success);
  assert.ok(!profileSchema.safeParse({ fullName: "Jane", phone: "abc" }).success);
});

test("email change: normalises and validates", () => {
  const r = emailChangeSchema.safeParse({ email: " New@Example.COM " });
  assert.ok(r.success);
  assert.equal(r.data.email, "new@example.com");
  assert.ok(!emailChangeSchema.safeParse({ email: "nope" }).success);
});

test("password change: strength, match, and must differ from the current one", () => {
  const base = { currentPassword: "oldpass12", newPassword: "newpass12", confirmPassword: "newpass12", signOutOthers: true };
  assert.ok(passwordChangeSchema.safeParse(base).success);
  assert.ok(!passwordChangeSchema.safeParse({ ...base, newPassword: "short1", confirmPassword: "short1" }).success);
  assert.ok(!passwordChangeSchema.safeParse({ ...base, confirmPassword: "different12" }).success);
  assert.ok(!passwordChangeSchema.safeParse({ ...base, newPassword: "oldpass12", confirmPassword: "oldpass12" }).success);
  assert.ok(!passwordChangeSchema.safeParse({ ...base, currentPassword: "" }).success);
});

test("deactivate: needs the exact confirmation word and a password", () => {
  assert.ok(deactivateSchema.safeParse({ password: "x", confirmation: "DEACTIVATE" }).success);
  assert.ok(!deactivateSchema.safeParse({ password: "x", confirmation: "deactivate" }).success);
  assert.ok(!deactivateSchema.safeParse({ password: "", confirmation: "DEACTIVATE" }).success);
});

test("notification categories are filtered by role and sanitised", () => {
  assert.deepEqual(categoriesForRole("tenant"), ["announcements", "billing", "tenancy", "maintenance"]);
  assert.deepEqual(categoriesForRole("landlord"), ["billing", "tenancy", "maintenance", "staff"]);
  assert.deepEqual(categoriesForRole("admin"), []);
  assert.deepEqual(sanitizeMuted(["billing", "billing", "security", 5, "staff"]), ["billing", "staff"]);
});

test("avatar sniffing identifies png/jpeg/webp by content and refuses everything else", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffAvatarType(png)?.mime, "image/png");
  assert.equal(sniffAvatarType(jpg)?.ext, "jpg");
  assert.equal(sniffAvatarType(webp)?.mime, "image/webp");
  assert.equal(sniffAvatarType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffAvatarType(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(sniffAvatarType(new Uint8Array()), null);
});
