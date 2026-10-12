import assert from "node:assert/strict";
import { test } from "node:test";
import { propertySchema, unitSchema } from "./properties.ts";

const property = { name: "Bois Court", propertyType: "apartment", addressLine1: "12 Ngong Rd", city: "Nairobi", country: "ke" };

test("property: blank optionals become undefined, country is uppercased", () => {
  const r = propertySchema.safeParse({ ...property, description: "  ", postalCode: "" });
  assert.ok(r.success);
  assert.equal(r.data.description, undefined);
  assert.equal(r.data.country, "KE");
  assert.deepEqual(r.data.amenityIds, []);
});

test("property: rejects unknown type and ignores owner/status fields", () => {
  assert.ok(!propertySchema.safeParse({ ...property, propertyType: "castle" }).success);
  const r = propertySchema.safeParse({ ...property, landlordId: "x", status: "published", verificationStatus: "verified" });
  assert.ok(r.success);
  assert.deepEqual(Object.keys(r.data).sort().includes("status"), false);
  assert.equal("landlordId" in r.data, false);
});

const unit = { unitNumber: "A1", bedrooms: "2", bathrooms: "1.5", monthlyRent: "45000" };

test("unit: coerces numbers, defaults deposit/currency/status", () => {
  const r = unitSchema.safeParse({ ...unit, securityDeposit: "", floorNumber: "" });
  assert.ok(r.success);
  assert.equal(r.data.monthlyRent, 45000);
  assert.equal(r.data.securityDeposit, 0);
  assert.equal(r.data.currency, "KES");
  assert.equal(r.data.status, "vacant");
  assert.equal(r.data.floorNumber, undefined);
});

test("unit: landlords cannot set occupied/reserved; rejects bad rent", () => {
  assert.ok(!unitSchema.safeParse({ ...unit, status: "occupied" }).success);
  assert.ok(!unitSchema.safeParse({ ...unit, status: "reserved" }).success);
  assert.ok(!unitSchema.safeParse({ ...unit, monthlyRent: "-1" }).success);
  assert.ok(!unitSchema.safeParse({ ...unit, bathrooms: "1.3" }).success);
});
