import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeCsv } from "../src/lib/csv";
test("CSV preserves numeric negative balances and guards user-entered formulas", () => {
  const csv = serializeCsv([
    { name: "=1+1", balance: -125.25, reference: "+danger" },
  ]);
  assert.ok(csv.includes('"-125.25"'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'+danger"'));
});
test("CSV includes fields from heterogeneous payment and purchase records", () => {
  const csv = serializeCsv([
    { type: "Deposit", method: "Bank" },
    { type: "Personal purchase", description: 'Milk, "fresh"' },
  ]);
  assert.equal(csv.split("\r\n")[0], '"type","method","description"');
  assert.ok(csv.includes('"Milk, ""fresh"""'));
});
