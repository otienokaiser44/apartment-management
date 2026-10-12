import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteTokenSchema, linkExistingSchema, parseRosterCsv, precheckRoster, unitRequestSchema } from "./onboarding.ts";

test("roster csv: maps columns, ignores extras, requires unit_number and a contact column", () => {
  const ok = parseRosterCsv("Unit Number,tenant_name,tenant_email,extra\nA1,Jane,j@x.test,zzz\n");
  assert.ok("rows" in ok);
  assert.deepEqual(ok.rows[0], { unit_number: "A1", tenant_name: "Jane", tenant_email: "j@x.test", tenant_phone: "" });
  assert.ok("error" in parseRosterCsv("tenant_email\nj@x.test"));
  assert.ok("error" in parseRosterCsv("unit_number,tenant_name\nA1,Jane"));
  assert.ok("error" in parseRosterCsv("unit_number,tenant_email\n"));
});

test("roster precheck: flags missing unit, missing contact, bad email and duplicates", () => {
  const e = precheckRoster([
    { unit_number: "", tenant_name: "", tenant_email: "a@x.test", tenant_phone: "" },
    { unit_number: "A2", tenant_name: "", tenant_email: "", tenant_phone: "" },
    { unit_number: "A3", tenant_name: "", tenant_email: "nope", tenant_phone: "" },
    { unit_number: "A4", tenant_name: "", tenant_email: "", tenant_phone: "+254700000000" },
    { unit_number: " a4 ", tenant_name: "", tenant_email: "b@x.test", tenant_phone: "" },
  ]);
  assert.deepEqual(e.map((x) => x.row), [1, 2, 3, 5]);
  assert.ok(precheckRoster([]).length === 1);
});

test("link existing: needs a unit and email or phone", () => {
  const unitId = "00000000-0000-0000-0000-000000002001";
  assert.ok(linkExistingSchema.safeParse({ unitId, email: " T@X.test " }).success);
  assert.ok(linkExistingSchema.safeParse({ unitId, email: "", phone: "+254 711 000 001" }).success);
  assert.ok(!linkExistingSchema.safeParse({ unitId, email: "", phone: "" }).success);
  assert.ok(!linkExistingSchema.safeParse({ unitId: "x", email: "t@x.test" }).success);
});

test("unit request: code is normalised and must use the unambiguous alphabet", () => {
  const r = unitRequestSchema.safeParse({ propertyCode: " abcd2345 ", unitNumber: "A1", message: "" });
  assert.ok(r.success);
  assert.equal(r.data.propertyCode, "ABCD2345");
  assert.equal(r.data.message, undefined);
  assert.ok(!unitRequestSchema.safeParse({ propertyCode: "ABCD234O", unitNumber: "A1" }).success);
  assert.ok(!unitRequestSchema.safeParse({ propertyCode: "SHORT", unitNumber: "A1" }).success);
});

test("invite token: rejects short or odd-character tokens", () => {
  assert.ok(inviteTokenSchema.safeParse("a".repeat(64)).success);
  assert.ok(!inviteTokenSchema.safeParse("short").success);
  assert.ok(!inviteTokenSchema.safeParse("a".repeat(30) + "<script>").success);
});
