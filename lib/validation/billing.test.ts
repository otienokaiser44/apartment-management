import assert from "node:assert/strict";
import { test } from "node:test";
import { announcementSchema, billingSettingsSchema, monthOf, monthToPeriod, readingsFromEntries, waterBill } from "./billing.ts";

test("settings: coerces numbers, bounds percentage and due day", () => {
  const ok = billingSettingsSchema.safeParse({ defaultGarbageFee: "200", waterRatePerUnit: "55.5", latePenaltyPercentage: "5", rentDueDay: "5" });
  assert.ok(ok.success);
  assert.equal(ok.data.waterRatePerUnit, 55.5);
  assert.ok(!billingSettingsSchema.safeParse({ defaultGarbageFee: "0", waterRatePerUnit: "0", latePenaltyPercentage: "101", rentDueDay: "5" }).success);
  assert.ok(!billingSettingsSchema.safeParse({ defaultGarbageFee: "0", waterRatePerUnit: "0", latePenaltyPercentage: "0", rentDueDay: "31" }).success);
  assert.ok(!billingSettingsSchema.safeParse({ defaultGarbageFee: "-1", waterRatePerUnit: "0", latePenaltyPercentage: "0", rentDueDay: "5" }).success);
  assert.ok(!billingSettingsSchema.safeParse({ defaultGarbageFee: "abc", waterRatePerUnit: "0", latePenaltyPercentage: "0", rentDueDay: "5" }).success);
});

test("month helpers", () => {
  assert.equal(monthToPeriod("2026-10"), "2026-10-01");
  assert.equal(monthToPeriod("2026-13"), null);
  assert.equal(monthToPeriod("26-10"), null);
  assert.equal(monthToPeriod(undefined), null);
  assert.equal(monthOf(new Date(2026, 0, 15)), "2026-01");
});

test("water bill = units x rate, rounded to cents", () => {
  assert.equal(waterBill(12, 50), 600);
  assert.equal(waterBill(7.5, 12.35), 92.63);
  assert.equal(waterBill(0, 50), 0);
});

test("readings grid: skips blanks, picks the right field, reports bad rows", () => {
  const { readings, errors } = readingsFromEntries([
    { unitId: "a", current: "112.5", consumed: "" },
    { unitId: "b", current: "", consumed: "8" },
    { unitId: "c", current: "", consumed: "" },
    { unitId: "d", current: "1", consumed: "1" },
    { unitId: "e", current: "abc", consumed: "" },
    { unitId: "f", current: "-3", consumed: "" },
  ]);
  assert.deepEqual(readings, [{ unit_id: "a", current_reading: 112.5 }, { unit_id: "b", units_consumed: 8 }]);
  assert.deepEqual(errors.map((e) => e.row), [4, 5, 6]);
});

test("announcement: audience-specific value rules", () => {
  assert.ok(announcementSchema.safeParse({ title: "T", message: "M", audience: "all", value: "" }).success);
  assert.ok(announcementSchema.safeParse({ title: "T", message: "M", audience: "unpaid_only" }).success);
  assert.ok(announcementSchema.safeParse({ title: "T", message: "M", audience: "floor", value: "2" }).success);
  assert.ok(!announcementSchema.safeParse({ title: "T", message: "M", audience: "floor", value: "two" }).success);
  assert.ok(!announcementSchema.safeParse({ title: "T", message: "M", audience: "floor", value: "" }).success);
  assert.ok(!announcementSchema.safeParse({ title: "T", message: "M", audience: "unit" }).success);
  assert.ok(!announcementSchema.safeParse({ title: "", message: "M", audience: "all" }).success);
  assert.ok(!announcementSchema.safeParse({ title: "T", message: "M", audience: "everyone" }).success);
});
