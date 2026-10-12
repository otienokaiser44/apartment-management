import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSV_TEMPLATE, emptyRow, generateUnitNumbers, matrixToRows, parseCsv, validateBulkRows, validateGenerator, type BulkRow,
} from "./bulkUnits.ts";

const row = (o: Partial<BulkRow>): BulkRow => ({
  ...emptyRow(), unitNumber: "101", bedrooms: "1", bathrooms: "1", monthlyRent: "30000", ...o,
});

test("generator: floor 1, {floor}{number:02d}, 1..50 gives 101..150", () => {
  const out = generateUnitNumbers({ floor: 1, pattern: "{floor}{number:02d}", start: 1, end: 50 });
  assert.equal(out.length, 50);
  assert.equal(out[0], "101");
  assert.equal(out[49], "150");
});

test("generator: literal prefix, plain {number}, and rejects bad ranges", () => {
  assert.deepEqual(generateUnitNumbers({ floor: 2, pattern: "A-{floor}{number:03d}", start: 7, end: 8 }), ["A-2007", "A-2008"]);
  assert.deepEqual(generateUnitNumbers({ floor: 0, pattern: "G{number}", start: 1, end: 2 }), ["G1", "G2"]);
  assert.deepEqual(generateUnitNumbers({ floor: 1, pattern: "{number}", start: 5, end: 1 }), []);
  assert.ok(validateGenerator({ floor: 1, pattern: "{floor}", start: 1, end: 5 }));
  assert.equal(validateGenerator({ floor: 1, pattern: "{floor}{number:02d}", start: 1, end: 5 }), null);
});

test("csv: parses quotes, commas, CRLF and BOM; template round-trips", () => {
  const m = parseCsv('﻿unit_number,description\r\n1,"Big, sunny ""corner"""\r\n');
  assert.deepEqual(m, [["unit_number", "description"], ["1", 'Big, sunny "corner"']]);
  const r = matrixToRows(parseCsv(CSV_TEMPLATE));
  assert.ok("rows" in r);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].monthlyRent, "45000");
  assert.equal(r.rows[0].floor, "1");
});

test("csv: missing required columns and empty files are reported", () => {
  assert.ok("error" in matrixToRows(parseCsv("floor,bedrooms\n1,2")));
  assert.ok("error" in matrixToRows([]));
  assert.ok("error" in matrixToRows(parseCsv("unit_number,monthly_rent\n")));
});

test("validate: clean rows convert to units with defaults", () => {
  const v = validateBulkRows([row({}), row({ unitNumber: "102", floor: "1" })], []);
  assert.ok(v.ok);
  assert.equal(v.units[0].currency, "KES");
  assert.equal(v.units[1].floorNumber, 1);
});

test("validate: flags missing, wrong-type, in-batch and existing duplicates together", () => {
  const v = validateBulkRows(
    [
      row({ unitNumber: "" }),
      row({ unitNumber: "102", monthlyRent: "abc" }),
      row({ unitNumber: "103", floor: "one" }),
      row({ unitNumber: "104", monthlyRent: "" }),
      row({ unitNumber: "105" }),
      row({ unitNumber: " 105 " }),
      row({ unitNumber: "Z9" }),
    ],
    ["z9"],
  );
  assert.ok(!v.ok);
  const has = (rowNo: number, field: string) => v.errors.some((e) => e.row === rowNo && e.field === field);
  assert.ok(has(1, "unitNumber"));
  assert.ok(has(2, "monthlyRent"));
  assert.ok(has(3, "floor"));
  assert.ok(has(4, "monthlyRent"));
  assert.ok(!has(5, "unitNumber"));
  assert.ok(v.errors.some((e) => e.row === 6 && /Duplicate of row 5/.test(e.message)));
  assert.ok(v.errors.some((e) => e.row === 7 && /already exists/.test(e.message)));
});

test("validate: empty batch is an error", () => {
  assert.ok(!validateBulkRows([], []).ok);
});
