import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, calculate } from "../src/lib/settlement";
import { prepareEntity, validateState } from "../src/lib/validation";
import { demoRecords } from "../src/lib/demo";
import type {
  Entity,
  Member,
  Fuel,
  Cooking,
  Shared,
  Payment,
  Purchase,
  Attendance,
  Settlement,
} from "../src/lib/domain";
const date = "2026-09-01";
const member = (id: string): Member => ({
  id,
  kind: "member",
  name: `Member ${id}`,
  phone: "",
  qaum: "",
  status: "Active",
  arrival: date + "T09:00",
  departure: "",
  openingCredit: 0,
  notes: "",
});
const base = (): Entity[] => [member("a"), member("b"), member("c")];
const food: Entity = {
  id: "food",
  kind: "food",
  date,
  meal: "Breakfast",
  description: "Food",
  amount: 10000,
};
const attendance = (id: string): Attendance => ({
  id: `att-${id}`,
  kind: "attendance",
  date,
  meal: "Breakfast",
  memberId: id,
});
const fuel = (id = "oil"): Fuel => ({
  id,
  kind: "fuel",
  date,
  resource: "Oil",
  amount: 100000,
  tier: "average",
  memberIds: [],
  effective: date,
  end: "",
  breakfast: 3000,
  lunch: 5000,
  dinner: 5000,
  notes: "",
});
const log: Cooking = {
  id: "log",
  kind: "cooking",
  date,
  meal: "Breakfast",
  oilId: "oil",
  gasId: "",
  oilRate: 3000,
  gasRate: 0,
};
const shared: Shared = {
  id: "shared",
  kind: "shared",
  date,
  category: "Water",
  description: "Water",
  amount: 10000,
  method: "Equal",
  memberIds: ["a", "b"],
  manual: {},
};
const payment: Payment = {
  id: "p",
  kind: "payment",
  date,
  memberId: "a",
  type: "Deposit",
  amount: 7000,
  method: "Cash",
  reference: "",
  notes: "",
};

test("largest remainder preserves every paisa and is stable by ID", () => {
  assert.deepEqual(
    allocate(100, [
      { id: "c", weight: 1 },
      { id: "b", weight: 1 },
      { id: "a", weight: 1 },
    ]),
    { a: 34, b: 33, c: 33 },
  );
});
test("allocation invariant over many totals and fractional weights", () => {
  for (let total = 0; total < 500; total++) {
    const shares = allocate(total, [
      { id: "a", weight: 0.5 },
      { id: "b", weight: 2.5 },
      { id: "c", weight: 1 },
    ]);
    assert.equal(
      Object.values(shares).reduce((a, b) => a + b, 0),
      total,
    );
    assert.ok(Object.values(shares).every(Number.isInteger));
  }
});
test("zero weight rejected without creating invalid monetary values", () => {
  assert.throws(() => allocate(100, [{ id: "a", weight: 0 }]), /positive/);
});
test("food is divided only among actual eaters, all rows combine", () => {
  const r = calculate([
    ...base(),
    food,
    { ...food, id: "extra", amount: 1001 },
    attendance("a"),
    attendance("b"),
  ]);
  assert.equal(r.settlements[0].food, 5501);
  assert.equal(r.settlements[1].food, 5500);
  assert.equal(r.settlements[2].food, 0);
});
test("zero-eater guard exposes warning and never assigns costs", () => {
  const r = calculate([...base(), food, fuel(), log]);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.lines.length, 0);
  assert.equal(r.fuelCharged.oil, undefined);
});
test("manual shared amounts are independent from equal meal splits", () => {
  const r = calculate([
    member("a"),
    member("b"),
    food,
    attendance("a"),
    attendance("b"),
    { ...shared, amount: 60000, method: "Manual", manual: {a: 10000, b: 50000} },
  ]);
  assert.equal(r.settlements[0].shared, 10000);
  assert.equal(r.settlements[1].shared, 50000);
  assert.equal(r.settlements[0].food, 5000);
});
test("equal shared split divides evenly", () => {
  const r = calculate([
    member("a"),
    member("b"),
    { ...shared, method: "Equal" },
  ]);
  assert.equal(r.settlements[0].shared, 5000);
});
test("excluded shared expenses do not enter settlements", () => {
  assert.equal(
    calculate([...base(), { ...shared, method: "Excluded" }]).lines.length,
    0,
  );
});
test("manual allocations must reconcile exactly", () => {
  assert.throws(
    () =>
      validateState([
        ...base(),
        { ...shared, method: "Manual", manual: { a: 1000, b: 1000 } },
      ]),
    /equal/,
  );
  validateState([
    ...base(),
    { ...shared, method: "Manual", manual: { a: 3000, b: 7000 } },
  ]);
});
test("direct fuel split adds to what is owed once and never enters meals", () => {
  const r = calculate([
    ...base(),
    {
      ...fuel(),
      tier: "divide_by_people",
      memberIds: ["a", "b"],
      amount: 10001,
    },
    payment,
  ]);
  assert.equal(r.mealSummaries.length, 0);
  assert.equal(r.settlements[0].fuel, 5001);
  assert.equal(r.settlements[0].balance, -1999);
  assert.equal(r.settlements[1].balance, 5000);
});
test("only the selected concurrent fuel entry is charged", () => {
  const r = calculate([
    ...base(),
    food,
    fuel(),
    { ...fuel("other"), breakfast: 9000 },
    log,
    attendance("a"),
  ]);
  assert.equal(r.settlements[0].fuel, 3000);
  assert.equal(r.fuelCharged.other, undefined);
});
test("fuel never auto-stops at purchase amount", () => {
  const r = calculate([
    ...base(),
    { ...fuel(), amount: 1000 },
    log,
    attendance("a"),
  ]);
  assert.equal(r.fuelCharged.oil, 3000);
});
test("saved cooking rates survive later rate edits", () => {
  const changedFuel = { ...fuel(), breakfast: 9000 };
  const updated = prepareEntity({ ...log, oilRate: 99999 }, [
    ...base(),
    changedFuel,
    log,
  ]) as Cooking;
  assert.equal(updated.oilRate, 3000);
  const newLog = prepareEntity({ ...log, id: "new", date: "2026-09-02" }, [
    changedFuel,
  ]) as Cooking;
  assert.equal(newLog.oilRate, 9000);
});
test("effective dates and closure are enforced", () => {
  assert.throws(
    () => prepareEntity({ ...log, date: "2026-08-30" }, [fuel()]),
    /effective/,
  );
  assert.throws(
    () => prepareEntity(log, [{ ...fuel(), end: "2026-09-04" }]),
    /open/,
  );
  assert.throws(
    () => validateState([...base(), fuel(), { ...log, date: "2026-08-30" }]),
    /invalidate/,
  );
});
test("archiving referenced fuel is blocked", () => {
  assert.throws(() => validateState([...base(), log]), /invalidate/);
});
test("duplicate attendance rejected", () => {
  assert.throws(
    () =>
      validateState([
        ...base(),
        attendance("a"),
        { ...attendance("a"), id: "other" },
      ]),
    /Duplicate/,
  );
});
test("attendance stays within residence dates", () => {
  assert.throws(
    () =>
      validateState([...base(), { ...attendance("a"), date: "2026-08-31" }]),
    /stay/,
  );
});
test("deposits and purchases credit; refunds and reimbursements debit", () => {
  const purchase: Purchase = {
    id: "purchase",
    kind: "purchase",
    date,
    memberId: "a",
    description: "Supplies",
    amount: 4000,
    appliedTo: "General credit",
    expenseId: "",
  };
  const r = calculate([
    ...base(),
    payment,
    purchase,
    { ...payment, id: "refund", type: "Refund", amount: 2000 },
    { ...payment, id: "reimbursement", type: "Reimbursement", amount: 1000 },
  ]);
  assert.equal(r.settlements[0].credit, 8000);
  assert.equal(r.settlements[0].balance, -8000);
});
test("linked purchases cannot exceed their expense or survive expense removal", () => {
  const p: Purchase = {
    id: "purchase",
    kind: "purchase",
    date,
    memberId: "a",
    description: "Supplies",
    amount: 10001,
    appliedTo: "Meal expense",
    expenseId: "food",
  };
  assert.throws(() => validateState([...base(), food, p]), /exceed/);
  assert.throws(() => validateState([...base(), p]), /existing expense/);
});
test("historical attendance changes recalculate charges", () => {
  const before = calculate([...base(), food, attendance("a")]);
  const after = calculate([...base(), food, attendance("a"), attendance("b")]);
  assert.equal(before.settlements[0].balance, 10000);
  assert.equal(after.settlements[0].balance, 5000);
});
test("as-of balances exclude future entries and future opening credit", () => {
  const r = calculate(
    [
      { ...member("a"), arrival: "2026-10-01T09:00", openingCredit: 10000 },
      { ...payment, date: "2026-10-01" },
    ],
    "2026-09-30",
  );
  assert.equal(r.settlements[0].balance, 0);
});
test("each ledger closing balance equals settlement and signs are consistent", () => {
  const r = calculate([
    ...base(),
    food,
    attendance("a"),
    attendance("b"),
    payment,
  ]);
  for (const m of r.settlements) {
    const own = r.lines.filter((l) => l.memberId === m.id);
    assert.equal(own.at(-1)?.balance || 0, m.balance);
    assert.equal(m.food + m.fuel + m.shared - m.credit, m.balance);
  }
});
test("demo data satisfies real integrity rules", () => {
  validateState(demoRecords());
});

// "a" owes 5000 (a shared bill), "b" has 10000 credit, "c" is even.
const ledger = (): Entity[] => [
  member("a"),
  { ...member("b"), openingCredit: 10000 },
  member("c"),
  {
    id: "bill",
    kind: "shared",
    date,
    category: "Electricity",
    description: "Bill",
    amount: 5000,
    method: "Equal",
    memberIds: ["a"],
    manual: {},
  },
];
const settle = (over: Partial<Settlement>): Settlement => ({
  id: "s1",
  kind: "settlement",
  date,
  memberId: "a",
  mode: "cash",
  receiverId: "b",
  amount: 3000,
  notes: "",
  ...over,
});
const balanceOf = (rs: Entity[], id: string) =>
  calculate(rs).settlements.find((m) => m.id === id)!.balance;

test("cash given to another member lowers the giver's due and the receiver's account", () => {
  const records = [...ledger(), settle({})];
  validateState(records);
  assert.equal(balanceOf(records, "a"), 5000 - 3000);
  // Receiver was in credit: credit shrinks. The mess total is unchanged.
  assert.equal(balanceOf(records, "b"), -10000 + 3000);
  assert.equal(
    ["a", "b", "c"].reduce((n, id) => n + balanceOf(records, id), 0),
    balanceOf(ledger(), "a") + balanceOf(ledger(), "b"),
  );
  // Receiver with no credit goes into due by the cash they now hold.
  const toC = [...ledger(), settle({ receiverId: "c" })];
  assert.equal(balanceOf(toC, "c"), 3000);
  // Both sides appear in the ledger with who paid whom.
  const lines = calculate(records).lines;
  assert.match(
    lines.find((l) => l.id === "s1-from")!.description,
    /Paid cash to Member b/,
  );
  assert.match(
    lines.find((l) => l.id === "s1-to")!.description,
    /Received cash from Member a/,
  );
});

test("settled amounts bring balances to zero and stay in history", () => {
  const due = [
    ...ledger(),
    settle({ mode: "forgive_due", receiverId: undefined, amount: 5000, notes: "Guest house" }),
  ];
  assert.equal(balanceOf(due, "a"), 0);
  assert.equal(balanceOf(due, "b"), -10000); // others are not affected
  const line = calculate(due).lines.find((l) => l.id === "s1")!;
  assert.match(line.description, /Due settled · Guest house/);
  const credit = [
    ...ledger(),
    settle({ memberId: "b", mode: "waive_credit", receiverId: undefined, amount: 10000, notes: "No refund needed" }),
  ];
  assert.equal(balanceOf(credit, "b"), 0);
  // Forgiven amounts are not counted as money the member contributed.
  assert.equal(
    calculate(due).settlements.find((m) => m.id === "a")!.credit,
    0,
  );
  // Archiving the record restores the original balance.
  assert.equal(balanceOf(due.filter((r) => r.id !== "s1"), "a"), 5000);
});

test("settlement validation", () => {
  const bad = (s: Settlement) => () => validateState([...ledger(), s]);
  assert.throws(bad(settle({ receiverId: undefined })), /who received/);
  assert.throws(bad(settle({ receiverId: "a" })), /themselves/);
  assert.throws(bad(settle({ receiverId: "ghost" })), /no longer exists/);
  assert.throws(
    bad(settle({ mode: "forgive_due", receiverId: undefined, notes: " " })),
    /reason/,
  );
  assert.throws(bad(settle({ mode: "forgive_due", notes: "x" })), /receiver/);
  assert.throws(() => prepareEntity(settle({ amount: 0 }), ledger()));
});
