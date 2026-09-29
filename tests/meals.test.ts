import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMealChanges,
  readMeal,
  type MealInput,
} from "../src/lib/meal-service";
import { buildExpenseChanges } from "../src/lib/expense-service";
import { calculate } from "../src/lib/settlement";
import { validateState } from "../src/lib/validation";
import type { Entity, Fuel, Shared } from "../src/lib/domain";

const date = "2026-09-29";
const members: Entity[] = ["ali", "yasin", "omar"].map((id) => ({
  id,
  kind: "member",
  name: id,
  phone: "",
  status: "Active",
  arrival: "2026-09-01",
  departure: "",
  openingCredit: 0,
  notes: "",
}));
const input = (): MealInput => ({
  date,
  meal: "Breakfast",
  items: [
    { id: "egg", description: "Eggs", amount: 25000, paidBy: "ali" },
    { id: "roti", description: "Roti", amount: 50000, paidBy: "yasin" },
  ],
  memberIds: ["ali", "yasin"],
  oilId: "",
  gasId: "",
  chaiId: "",
});
function apply(
  records: Entity[],
  changes: { upsert: Entity[]; archive: string[] },
) {
  const ids = [...changes.upsert.map((r) => r.id), ...changes.archive];
  const next = [
    ...records.filter((r) => !ids.includes(r.id)),
    ...changes.upsert,
  ];
  validateState(next);
  return next;
}
function save(value: MealInput, records = members) {
  return apply(records, buildMealChanges(value, records));
}
function balances(records: Entity[]) {
  return calculate(records).settlements.map((s) => ({
    id: s.id,
    food: s.food,
    fuel: s.fuel,
    credit: s.credit,
    balance: s.balance,
  }));
}
const chai: Fuel = {
  id: "chai",
  kind: "fuel",
  resource: "Chai",
  date,
  amount: 100000,
  paidBy: "omar",
  tier: "average",
  memberIds: [],
  effective: date,
  end: "",
  breakfast: 10000,
  lunch: 0,
  dinner: 5000,
  notes: "Tea, milk and sugar",
};

test("ingredient buyers receive the full cost; eaters share the combined meal", () => {
  assert.deepEqual(balances(save(input())), [
    { id: "ali", food: 37500, fuel: 0, credit: 25000, balance: 12500 },
    { id: "yasin", food: 37500, fuel: 0, credit: 50000, balance: -12500 },
    { id: "omar", food: 0, fuel: 0, credit: 0, balance: 0 },
  ]);
});
test("adding later items replaces charges and repeating save never duplicates credits", () => {
  const first = save(input());
  const edit = readMeal(first, date, "Breakfast");
  edit.items.push({
    id: "paratha",
    description: "Paratha",
    amount: 15000,
    paidBy: "ali",
  });
  const second = save(edit, first);
  const third = save(readMeal(second, date, "Breakfast"), second);
  assert.deepEqual(balances(third), balances(second));
  assert.equal(calculate(second).settlements[0].food, 45000);
  assert.equal(calculate(second).settlements[0].credit, 40000);
  assert.equal(calculate(second).mealSummaries.length, 1);
});
test("editing price, changing buyer and removing an ingredient transfer or reverse exact credits", () => {
  const first = save(input());
  const edit = readMeal(first, date, "Breakfast");
  edit.items[0] = { ...edit.items[0], amount: 30000, paidBy: "omar" };
  edit.items.splice(1, 1);
  const next = save(edit, first);
  const result = calculate(next);
  assert.deepEqual(
    result.settlements.map((s) => s.credit),
    [0, 0, 30000],
  );
  assert.deepEqual(
    result.settlements.map((s) => s.food),
    [15000, 15000, 0],
  );
});
test("changing eaters replaces shares without altering who paid", () => {
  const first = save(input());
  const edit = readMeal(first, date, "Breakfast");
  edit.memberIds.push("omar");
  const result = calculate(save(edit, first));
  assert.deepEqual(
    result.settlements.map((s) => s.food),
    [25000, 25000, 25000],
  );
  assert.deepEqual(
    result.settlements.map((s) => s.credit),
    [25000, 50000, 0],
  );
});
test("duplicate date and meal are rejected, but different meal times are independent", () => {
  const first = save(input());
  assert.throws(() => save(input(), first), /already exists/);
  const lunch = {
    ...input(),
    meal: "Lunch" as const,
    items: [{ ...input().items[0], id: "lunch" }],
  };
  assert.equal(calculate(save(lunch, first)).mealSummaries.length, 2);
});
test("meal archive reverses every meal charge and automatic buyer credit", () => {
  const first = save(input());
  const next = save(
    { ...readMeal(first, date, "Breakfast"), remove: true },
    first,
  );
  assert.equal(calculate(next).lines.length, 0);
});
test("chai buyer credited once and meal rates retain saved values after rate edits", () => {
  const first = save({ ...input(), chaiId: chai.id }, [...members, chai]);
  assert.equal(calculate(first).settlements[2].credit, 100000);
  assert.equal(calculate(first).fuelCharged.chai, 10000);
  const rateChanged = apply(
    first,
    buildExpenseChanges([{ ...chai, breakfast: 90000 }], [], first),
  );
  const edited = save(readMeal(rateChanged, date, "Breakfast"), rateChanged);
  assert.equal(calculate(edited).mealSummaries[0].chai, 10000);
  assert.equal(calculate(edited).settlements[2].credit, 100000);
});
test("direct chai split and buyer credit reconcile and can be archived", () => {
  const direct = {
    ...chai,
    tier: "divide_by_people",
    memberIds: ["ali", "yasin"],
  };
  const first = apply(members, buildExpenseChanges([direct], [], members));
  assert.deepEqual(
    calculate(first).settlements.map((s) => s.balance),
    [50000, 50000, -100000],
  );
  const removed = apply(first, buildExpenseChanges([], [chai.id], first));
  assert.equal(calculate(removed).lines.length, 0);
});
test("inactive historical eaters remain editable, new inactive eaters are rejected", () => {
  const first = save(input()).map(
    (r): Entity =>
      r.kind === "member" && r.id === "ali" ? { ...r, status: "Left" } : r,
  );
  const edited = save(readMeal(first, date, "Breakfast"), first);
  assert.equal(calculate(edited).mealSummaries[0].eaters, 2);
  assert.throws(
    () => save({ ...input(), meal: "Lunch", items: [] }, first),
    /active members/,
  );
});
test("zero eaters, invalid dates, cross-meal ingredient IDs, and unknown payers are rejected", () => {
  assert.throws(() => save({ ...input(), memberIds: [] }), /at least one/);
  assert.throws(() => save({ ...input(), date: "2026-02-30" }), /valid date/);
  const first = save(input());
  assert.throws(
    () => save({ ...input(), meal: "Lunch" }, first),
    /another record/,
  );
  assert.throws(
    () =>
      save({ ...input(), items: [{ ...input().items[0], paidBy: "missing" }] }),
    /member no longer/,
  );
});
test("legacy meal costs and multiple buyer contributions retain balances and credit dates", () => {
  const legacy: Entity[] = [
    ...members,
    {
      id: "food",
      kind: "food",
      date,
      meal: "Breakfast",
      description: "Supplies",
      amount: 10000,
    },
    { id: "a", kind: "attendance", date, meal: "Breakfast", memberId: "ali" },
    {
      id: "p1",
      kind: "purchase",
      date: "2026-09-28",
      memberId: "ali",
      description: "Supplies",
      amount: 4000,
      appliedTo: "Meal expense",
      expenseId: "food",
    },
    {
      id: "p2",
      kind: "purchase",
      date,
      memberId: "yasin",
      description: "Supplies",
      amount: 2000,
      appliedTo: "Meal expense",
      expenseId: "food",
    },
  ];
  const value = readMeal(legacy, date, "Breakfast");
  assert.equal(value.items.length, 3);
  const next = save(value, legacy);
  assert.deepEqual(balances(next), balances(legacy));
  assert.deepEqual(
    calculate(next, "2026-09-28").settlements.map((s) => s.balance),
    calculate(legacy, "2026-09-28").settlements.map((s) => s.balance),
  );
  assert.equal(next.filter((r) => r.kind === "purchase").length, 0);
  assert.deepEqual(
    balances(save(readMeal(next, date, "Breakfast"), next)),
    balances(next),
  );
});
test("fully funded legacy item becomes a buyer item with no duplicate old expense", () => {
  const first = save(input()).filter((r) => r.kind !== "food");
  const legacy: Entity[] = [
    ...first,
    {
      id: "food",
      kind: "food",
      date,
      meal: "Breakfast",
      description: "Food",
      amount: 100,
    },
    {
      id: "p",
      kind: "purchase",
      date,
      memberId: "ali",
      description: "Food",
      amount: 100,
      appliedTo: "Meal expense",
      expenseId: "food",
    },
  ];
  const next = save(readMeal(legacy, date, "Breakfast"), legacy);
  assert.equal(next.filter((r) => r.kind === "food").length, 1);
  assert.deepEqual(balances(next), balances(legacy));
});
test("shared buyer changes replace historical linked credits and expense edits update credit", () => {
  const shared: Shared = {
    id: "shared",
    kind: "shared",
    date,
    amount: 10000,
    description: "Water",
    category: "Water",
    method: "Equal",
    memberIds: ["ali", "yasin"],
    manual: {},
  };
  const legacy: Entity[] = [
    ...members,
    shared,
    {
      id: "p",
      kind: "purchase",
      date,
      memberId: "ali",
      amount: 10000,
      description: "Water",
      appliedTo: "Shared expense",
      expenseId: shared.id,
    },
  ];
  const next = apply(
    legacy,
    buildExpenseChanges(
      [{ ...shared, amount: 12000, paidBy: "yasin" }],
      [],
      legacy,
    ),
  );
  assert.deepEqual(
    calculate(next).settlements.map((s) => s.credit),
    [0, 12000, 0],
  );
  assert.equal(
    next.some((r) => r.id === "p"),
    false,
  );
  assert.equal(
    calculate(apply(next, buildExpenseChanges([], [shared.id], next))).lines
      .length,
    0,
  );
});
test("generic record writes cannot bypass the combined meal editor", () => {
  const first = save(input());
  assert.throws(
    () =>
      buildExpenseChanges([first.find((r) => r.kind === "food")], [], first),
    /meal editor/,
  );
  assert.throws(() => buildExpenseChanges([], ["egg"], first), /meal editor/);
});
