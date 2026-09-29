import { z } from "zod";
import { byKind, type Entity, type Cooking, type Fuel } from "./domain";
const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Enter a valid date",
  );
const emptyDate = z.union([date, z.literal("")]);
const money = z.number().int().min(0).max(1_000_000_000);
const meal = z.enum(["Breakfast", "Lunch", "Dinner"]);
const members = z
  .array(id)
  .max(1000)
  .refine((a) => new Set(a).size === a.length, "Duplicate members");
const note = z.string().max(2000);
export const entitySchema = z.discriminatedUnion("kind", [
  z.object({
    id,
    kind: z.literal("member"),
    name: z.string().trim().min(2).max(100),
    phone: z.string().max(30),
    qaum: z.string().max(100).default(""),
    status: z.enum(["Active", "Left", "Archived"]),
    arrival: z
      .string()
      .min(10)
      .max(30)
      .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid arrival"),
    departure: z
      .string()
      .max(30)
      .refine((s) => !s || !Number.isNaN(Date.parse(s)), "Invalid departure"),
    openingCredit: money,
    notes: note,
  }),
  z.object({ id, kind: z.literal("attendance"), date, meal, memberId: id }),
  z.object({
    id,
    kind: z.literal("food"),
    paidBy: z.string().max(100).optional(),
    paidAt: date.optional(),
    date,
    meal,
    description: z.string().trim().min(1).max(300),
    amount: money.positive(),
  }),
  z.object({
    id,
    kind: z.literal("fuel"),
    paidBy: z.string().max(100).optional(),
    date,
    resource: z.enum(["Oil", "Gas", "Chai"]),
    amount: money.positive(),
    tier: z.enum(["divide_by_people", "average"]),
    memberIds: members,
    effective: emptyDate,
    end: emptyDate,
    breakfast: money,
    lunch: money,
    dinner: money,
    notes: note,
  }),
  z.object({
    id,
    kind: z.literal("cooking"),
    date,
    meal,
    oilId: z.string().max(100),
    gasId: z.string().max(100),
    oilRate: money,
    gasRate: money,
    chaiId: z.string().max(100).default(""),
    chaiRate: money.default(0),
  }),
  z.object({
    id,
    kind: z.literal("shared"),
    paidBy: z.string().max(100).optional(),
    date,
    category: z.enum([
      "Electricity",
      "Water",
      "Cleaning",
      "Internet",
      "Salary",
      "Other",
    ]),
    description: z.string().min(1).max(300),
    amount: money.positive(),
    method: z.enum(["Equal", "Manual", "Excluded"]),
    memberIds: members,
    manual: z.record(z.string(), money),
  }),
  z.object({
    id,
    kind: z.literal("payment"),
    date,
    memberId: id,
    type: z.enum(["Deposit", "Refund", "Reimbursement"]),
    amount: money.positive(),
    method: z.enum(["Cash", "Bank", "JazzCash", "Easypaisa", "Other"]),
    reference: z.string().max(100),
    notes: note,
  }),
  z.object({
    id,
    kind: z.literal("purchase"),
    date,
    memberId: id,
    description: z.string().min(1).max(300),
    amount: money.positive(),
    appliedTo: z.enum(["General credit", "Meal expense", "Shared expense"]),
    expenseId: z.string().max(100),
  }),
]);

export function prepareEntity(input: unknown, records: Entity[]): Entity {
  const entity = entitySchema.parse(input) as Entity;
  const previous = records.find((r) => r.id === entity.id);
  if (previous && previous.kind !== entity.kind)
    throw new Error("Record type cannot be changed");
  if (entity.kind === "cooking") {
    const old = previous as Cooking | undefined;
    for (const resource of ["oil", "gas", "chai"] as const) {
      const key = `${resource}Id` as const;
      const rate = `${resource}Rate` as const;
      if (!entity[key]) {
        entity[rate] = 0;
        continue;
      }
      const entry = records.find(
        (e) => e.id === entity[key] && e.kind === "fuel",
      ) as Fuel | undefined;
      if (
        !entry ||
        entry.tier !== "average" ||
        entry.resource.toLowerCase() !== resource
      )
        throw new Error(`Select a valid ${resource} entry`);
      if (
        entity.date < entry.effective ||
        (entry.end && entity.date > entry.end)
      )
        throw new Error(`${resource} entry is outside its effective dates`);
      const sameLog =
        old &&
        old[key] === entity[key] &&
        old.meal === entity.meal &&
        old.date === entity.date;
      if (!sameLog && entry.end)
        throw new Error(`Choose an open ${resource} entry`);
      entity[rate] = sameLog
        ? old[rate] || 0
        : entry[entity.meal.toLowerCase() as "breakfast" | "lunch" | "dinner"];
    }
  }
  return entity;
}

export function validateState(records: Entity[]) {
  const ids = new Set(records.map((r) => r.id));
  if (ids.size !== records.length) throw new Error("Duplicate record ID");
  const memberIds = new Set(byKind(records, "member").map((m) => m.id));
  const membersById = new Map(byKind(records, "member").map((m) => [m.id, m]));
  const fuelById = new Map(byKind(records, "fuel").map((f) => [f.id, f]));
  const recordById = new Map(records.map((r) => [r.id, r]));
  const purchaseTotals = new Map<string, number>();
  for (const p of byKind(records, "purchase"))
    if (p.appliedTo !== "General credit")
      purchaseTotals.set(
        p.expenseId,
        (purchaseTotals.get(p.expenseId) || 0) + p.amount,
      );
  const checkMember = (id: string) => {
    if (!memberIds.has(id))
      throw new Error("A referenced member no longer exists");
  };
  const unique = new Set<string>();
  for (const e of records) {
    if ("paidBy" in e && e.paidBy) checkMember(e.paidBy);
    if ("memberId" in e) checkMember(e.memberId);
    if ("memberIds" in e) e.memberIds.forEach(checkMember);
    if (e.kind === "member" && e.departure && e.departure < e.arrival)
      throw new Error("Departure must follow arrival");
    if (e.kind === "attendance" || e.kind === "cooking") {
      const key = `${e.kind}|${e.date}|${e.meal}|${e.kind === "attendance" ? e.memberId : ""}`;
      if (unique.has(key))
        throw new Error("Duplicate attendance or cooking log");
      unique.add(key);
    }
    if (e.kind === "attendance") {
      const m = membersById.get(e.memberId)!;
      if (
        e.date < m.arrival.slice(0, 10) ||
        (m.departure && e.date > m.departure.slice(0, 10))
      )
        throw new Error("Attendance must fall within the member’s stay");
    }
    if (e.kind === "fuel") {
      if (e.tier === "divide_by_people" && !e.memberIds.length)
        throw new Error("Select at least one member for a direct fuel split");
      if (
        e.tier === "average" &&
        (!e.effective || (e.end && e.end < e.effective))
      )
        throw new Error("Check the fuel effective and end dates");
    }
    if (e.kind === "cooking") {
      for (const resource of ["oil", "gas", "chai"] as const) {
        const key = `${resource}Id` as const;
        if (e[key]) {
          const fuel = fuelById.get(e[key]);
          if (
            !fuel ||
            fuel.resource.toLowerCase() !== resource ||
            fuel.tier !== "average" ||
            e.date < fuel.effective ||
            (fuel.end && e.date > fuel.end)
          )
            throw new Error(
              "Fuel entry changes would invalidate a cooking log. Correct that log first.",
            );
        }
      }
    }
    if (e.kind === "shared" && e.method !== "Excluded") {
      if (!e.memberIds.length) throw new Error("Select participating members");
      if (
        e.method === "Manual" &&
        (Object.keys(e.manual).some((id) => !e.memberIds.includes(id)) ||
          e.memberIds.reduce((n, id) => n + (e.manual[id] || 0), 0) !==
            e.amount)
      )
        throw new Error("Manual shares must equal the expense amount exactly");
    }
    if (e.kind === "purchase" && e.appliedTo !== "General credit") {
      const expense = recordById.get(e.expenseId);
      if (
        !expense ||
        expense.kind !== (e.appliedTo === "Meal expense" ? "food" : "shared") ||
        !("amount" in expense)
      )
        throw new Error("Select the existing expense funded by this purchase");
      if ("paidBy" in expense && expense.paidBy)
        throw new Error(
          "Remove the old linked credit before assigning a buyer to this expense",
        );
      const total = purchaseTotals.get(e.expenseId) || 0;
      if (total > expense.amount)
        throw new Error("Personal purchase credits exceed the linked expense");
    }
  }
}
