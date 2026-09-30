import { test } from "node:test";
import assert from "node:assert/strict";
import { can, normalizeRole } from "../src/lib/permissions";
import { prepareRecordMutation } from "../src/lib/record-service";
import { readMeal, type MealInput } from "../src/lib/meal-service";
import { calculate } from "../src/lib/settlement";
import { migrateRecords } from "../src/lib/migrations";
import { prepareEntity, validateState } from "../src/lib/validation";
import { canJoinMeal, isResidentOn, isKnownResidentOn } from "../src/lib/stays";
import type { Entity, Member, Shared } from "../src/lib/domain";

const member = (id: string): Member => ({
  id,
  kind: "member",
  name: id,
  qaum: "",
  phone: "",
  notes: "",
  status: "Active",
  arrival: "2026-01-01",
  departure: "",
  openingCredit: 0,
});
const members = [member("ali"), member("yasin")];
const meal: MealInput = {
  date: "2026-01-05",
  meal: "Breakfast",
  memberIds: ["ali", "yasin"],
  items: [
    { id: "egg", description: "Eggs", amount: 25001, paidBy: "ali" },
    { id: "roti", description: "Roti", amount: 50000, paidBy: "yasin" },
  ],
  oilId: "",
  gasId: "",
  chaiId: "",
};
const save = (value: MealInput, records: Entity[] = members) =>
  prepareRecordMutation({ meal: value, upsert: [], archive: [] }, records);

test("roles fail closed and separate writing from user administration", () => {
  for (const role of [undefined, "user"] as const) {
    assert.equal(can(role, "records:write"), false);
    assert.equal(can(role, "users:manage"), false);
  }
  assert.equal(normalizeRole("owner"), "user");
  assert.equal(can("moderator", "records:write"), true);
  assert.equal(can("moderator", "users:manage"), false);
  assert.equal(can("admin", "users:manage"), true);
});
test("persisted source payments retain exact credits on repeated saves and source edits", () => {
  const first = save(meal).next;
  assert.equal(first.filter((r) => r.kind === "payment").length, 2);
  assert.deepEqual(
    calculate(first).settlements.map((r) => r.credit),
    [25001, 50000],
  );
  const again = save(readMeal(first, meal.date, meal.meal), first);
  assert.equal(again.upsert.length, 0);
  assert.equal(again.archive.length, 0);
  const edit = readMeal(first, meal.date, meal.meal);
  edit.items[0] = { ...edit.items[0], amount: 30000, paidBy: "yasin" };
  edit.items.splice(1, 1);
  const changed = save(edit, first);
  assert.ok(changed.archive.includes("credit:roti"));
  assert.deepEqual(
    calculate(changed.next).settlements.map((r) => [r.food, r.credit]),
    [
      [15000, 0],
      [15000, 30000],
    ],
  );
  const removed = save(
    { ...readMeal(changed.next, meal.date, meal.meal), remove: true },
    changed.next,
  );
  assert.ok(removed.archive.includes("credit:egg"));
  assert.equal(removed.next.filter((r) => r.kind !== "member").length, 0);
});
test("payer removal and reassignment restore one stable source credit", () => {
  const first = save(meal).next,
    edit = readMeal(first, meal.date, meal.meal);
  edit.items[0].paidBy = "";
  const removed = save(edit, first);
  assert.ok(removed.archive.includes("credit:egg"));
  edit.items[0].paidBy = "ali";
  const restored = save(edit, removed.next).next;
  assert.equal(restored.filter((r) => r.id === "credit:egg").length, 1);
});
test("automatic credits cannot be edited or archived directly", () => {
  const first = save(meal).next,
    credit = first.find((r) => r.id === "credit:egg")!;
  assert.throws(
    () => prepareRecordMutation({ upsert: [credit], archive: [] }, first),
    /source expense/,
  );
  assert.throws(
    () => prepareRecordMutation({ upsert: [], archive: [credit.id] }, first),
    /source expense/,
  );
  assert.throws(
    () => save({ ...meal, items: [{ ...meal.items[0], id: "credit:forged" }] }),
    /reserved/,
  );
});
test("legacy migration creates durable history without changing balances and is idempotent", () => {
  const legacy: Entity[] = [
    ...members,
    {
      kind: "food",
      id: "legacy",
      date: meal.date,
      meal: meal.meal,
      description: "Eggs",
      amount: 10001,
      paidBy: "ali",
    },
    {
      kind: "attendance",
      id: "eat",
      date: meal.date,
      meal: meal.meal,
      memberId: "ali",
    },
  ];
  const converted = migrateRecords(legacy);
  assert.equal(converted.filter((r) => r.kind === "payment").length, 1);
  assert.deepEqual(
    calculate(legacy).settlements.map((m) => m.balance),
    calculate(converted).settlements.map((m) => m.balance),
  );
  assert.deepEqual(migrateRecords(converted), converted);
});
test("two residence periods retain both histories and prohibit meals during the gap", () => {
  const returning = {
    ...member("ali"),
    stays: [
      { id: "jan", arrival: "2026-01-01", departure: "2026-01-19" },
      { id: "jul", arrival: "2026-07-05", departure: "2026-08-10" },
    ],
  };
  assert.equal(isResidentOn(returning, "2026-01-19"), true);
  assert.equal(isResidentOn(returning, "2026-07-05"), true);
  assert.equal(isResidentOn(returning, "2026-03-01"), false);
  assert.equal(isResidentOn(returning, "2026-08-11"), false);
  const first = save({ ...meal, memberIds: ["ali"] }, [
    returning,
    member("yasin"),
  ]).next;
  const second = save(
    { ...meal, date: "2026-07-06", items: [], memberIds: ["ali"] },
    first,
  ).next;
  assert.equal(calculate(second).mealSummaries.length, 2);
  assert.throws(
    () =>
      save(
        { ...meal, date: "2026-03-01", items: [], memberIds: ["ali"] },
        first,
      ),
    /active members/,
  );
  assert.equal(calculate(second).settlements[0].food, 75001);
});
test("Archived still resides and shares electricity but cannot be a new meal eater", () => {
  const archived = { ...member("ali"), status: "Archived" as const };
  assert.equal(isResidentOn(archived, meal.date), true);
  assert.equal(isKnownResidentOn(archived, meal.date), true);
  assert.equal(
    isKnownResidentOn({ ...archived, status: "Left" }, meal.date),
    false,
  );
  assert.equal(canJoinMeal(archived, meal.date), false);
  const shared: Shared = {
    id: "electric",
    kind: "shared",
    date: meal.date,
    description: "Electricity",
    category: "Electricity",
    amount: 10001,
    method: "Equal",
    memberIds: ["ali", "yasin"],
    manual: {},
    paidBy: "ali",
  };
  const result = prepareRecordMutation({ upsert: [shared], archive: [] }, [
    archived,
    member("yasin"),
  ]).next;
  assert.equal(calculate(result).settlements[0].shared, 5001);
  assert.equal(calculate(result).settlements[0].credit, 10001);
  const removed = prepareRecordMutation(
    { upsert: [], archive: [shared.id] },
    result,
  );
  assert.ok(removed.archive.includes("credit:electric"));
});
test("stay edits reject overlap, impossible dates, open departures for Left and invalidated history", () => {
  const m = member("ali");
  assert.throws(
    () => prepareEntity({ ...m, status: "Left" }, []),
    /departure date/,
  );
  assert.throws(
    () =>
      prepareEntity(
        { ...m, stays: [{ id: "a", arrival: "2026-02-30", departure: "" }] },
        [],
      ),
    /valid stay dates/,
  );
  assert.throws(
    () =>
      prepareEntity(
        {
          ...m,
          stays: [
            { id: "a", arrival: "2026-01-01", departure: "" },
            { id: "b", arrival: "2026-07-05", departure: "" },
          ],
        },
        [],
      ),
    /overlap/,
  );
  const first = save(meal).next;
  assert.throws(
    () =>
      prepareRecordMutation(
        { upsert: [{ ...m, arrival: "2026-02-01" }], archive: [] },
        first,
      ),
    /within the member/,
  );
  // Unknown departures from old data do not make every unrelated edit fail.
  validateState([{ ...m, status: "Left" }]);
  validateState([{ ...m, arrival: "2026-01-01T09:00:00.000Z" }]);
});
