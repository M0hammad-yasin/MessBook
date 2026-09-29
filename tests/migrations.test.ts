import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateRecords } from "../src/lib/migrations";
import { calculate } from "../src/lib/settlement";
import { validateState } from "../src/lib/validation";
import type { Entity } from "../src/lib/domain";

test("units migration freezes historical shares, removes weights, and is idempotent", () => {
  const legacy = [
    ...["a", "b"].map((id, i) => ({
      id,
      kind: "member",
      name: id + " member",
      phone: "",
      status: "Active",
      arrival: "2026-09-01",
      departure: "",
      openingCredit: 0,
      notes: "",
      stayUnits: i ? 2.5 : 0.5,
    })),
    {
      id: "shared",
      kind: "shared",
      date: "2026-09-01",
      category: "Water",
      description: "Water",
      amount: 60001,
      method: "Stay units",
      memberIds: ["a", "b"],
      manual: {},
    },
  ] as unknown as Entity[];
  const result = migrateRecords(legacy);
  validateState(result);
  assert.equal("stayUnits" in result[0], false);
  assert.deepEqual(
    calculate(result).settlements.map((m) => m.shared),
    [10000, 50001],
  );
  assert.deepEqual(migrateRecords(result), result);
  assert.equal("stayUnits" in legacy[0], true);
});
