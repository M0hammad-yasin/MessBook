import { z } from "zod";
import { byKind, type Entity, type Meal, type Cooking } from "./domain";
import { prepareEntity } from "./validation";

const keySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum(["Breakfast", "Lunch", "Dinner"]),
});
export const mealInputSchema = keySchema.extend({
  original: keySchema.optional(),
  remove: z.boolean().optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        description: z.string().trim().min(1).max(300),
        amount: z.number().int().positive().max(1_000_000_000),
        paidBy: z.string().max(100),
        paidAt: z.string().optional(),
      }),
    )
    .max(100),
  memberIds: z.array(z.string()).max(1000),
  oilId: z.string().max(100),
  gasId: z.string().max(100),
  chaiId: z.string().max(100),
});
export type MealInput = z.infer<typeof mealInputSchema>;
export const isMealRecord = (
  r: Entity,
): r is Extract<Entity, { kind: "food" | "cooking" | "attendance" }> =>
  r.kind === "food" || r.kind === "cooking" || r.kind === "attendance";
export function mealRecords(records: Entity[], date: string, meal: Meal) {
  return records
    .filter(isMealRecord)
    .filter((r) => r.date === date && r.meal === meal);
}

/** Read legacy food, cooking and attendance as a single editable meal. */
export function readMeal(
  records: Entity[],
  date: string,
  meal: Meal,
): MealInput {
  const rows = mealRecords(records, date, meal);
  const log = rows.find((r): r is Cooking => r.kind === "cooking");
  const items = byKind(rows, "food").flatMap((food) => {
    const credits = byKind(records, "purchase").filter(
      (p) => p.appliedTo === "Meal expense" && p.expenseId === food.id,
    );
    if (!credits.length)
      return [
        {
          id: food.id,
          description: food.description,
          amount: food.amount,
          paidBy: food.paidBy || "",
          paidAt: food.paidAt,
        },
      ];
    // Each historical contribution becomes its own ingredient row, preserving its credit date.
    const funded = credits.map((p) => ({
      id: `funded-${p.id}`,
      description: food.description,
      amount: p.amount,
      paidBy: p.memberId,
      paidAt: p.date,
    }));
    const remaining = food.amount - credits.reduce((n, p) => n + p.amount, 0);
    return [
      ...funded,
      ...(remaining > 0
        ? [
            {
              id: food.id,
              description: food.description,
              amount: remaining,
              paidBy: "",
              paidAt: undefined,
            },
          ]
        : []),
    ];
  });
  return {
    date,
    meal,
    ...(rows.length ? { original: { date, meal } } : {}),
    items,
    memberIds: byKind(rows, "attendance").map((r) => r.memberId),
    oilId: log?.oilId || "",
    gasId: log?.gasId || "",
    chaiId: log?.chaiId || "",
  };
}

/** One atomic mutation replaces costs, attendance and buyer credits together. */
export function buildMealChanges(
  input: unknown,
  records: Entity[],
): { upsert: Entity[]; archive: string[] } {
  const value = mealInputSchema.parse(input);
  if (
    value.original &&
    (value.original.date !== value.date || value.original.meal !== value.meal)
  )
    throw new Error(
      "A saved meal's date and type cannot be changed. Open the correct meal instead.",
    );
  const previous = mealRecords(records, value.date, value.meal);
  if (!value.original && previous.length)
    throw new Error(
      "This meal already exists. Open the existing meal to add items.",
    );
  if (value.original && !previous.length)
    throw new Error("This meal no longer exists. Refresh before saving.");
  const oldFoodIds = byKind(previous, "food").map((r) => r.id);
  const linked = byKind(records, "purchase").filter(
    (p) => p.appliedTo === "Meal expense" && oldFoodIds.includes(p.expenseId),
  );
  if (value.remove) {
    if (!value.original) throw new Error("Select an existing meal to archive");
    return { upsert: [], archive: [...previous, ...linked].map((r) => r.id) };
  }
  if (!value.memberIds.length)
    throw new Error("Select at least one eater before saving this meal");
  if (new Set(value.memberIds).size !== value.memberIds.length)
    throw new Error("Duplicate eaters");
  if (new Set(value.items.map((r) => r.id)).size !== value.items.length)
    throw new Error("Duplicate ingredient rows");
  const oldAttendance = byKind(previous, "attendance");
  const members = byKind(records, "member");
  for (const id of value.memberIds) {
    const member = members.find((m) => m.id === id);
    if (
      !member ||
      (member.status !== "Active" &&
        !oldAttendance.some((a) => a.memberId === id))
    )
      throw new Error("Only active members can be added as eaters");
  }
  for (const item of value.items) {
    if (
      records.some((r) => r.id === item.id) &&
      !previous.some((r) => r.kind === "food" && r.id === item.id)
    )
      throw new Error("Ingredient belongs to another record");
  }
  const oldLog = previous.find((r) => r.kind === "cooking");
  const log = prepareEntity(
    {
      id: oldLog?.id || crypto.randomUUID(),
      kind: "cooking",
      date: value.date,
      meal: value.meal,
      oilId: value.oilId,
      gasId: value.gasId,
      chaiId: value.chaiId,
      oilRate: 0,
      gasRate: 0,
      chaiRate: 0,
    },
    records,
  );
  const oldItems = readMeal(records, value.date, value.meal).items;
  const upsert: Entity[] = [
    log,
    ...value.items.map((item) =>
      prepareEntity(
        {
          ...item,
          kind: "food",
          date: value.date,
          meal: value.meal,
          // Clients cannot move an existing credit to a different accounting date.
          paidAt: oldItems.find((r) => r.id === item.id)?.paidAt || value.date,
        },
        records,
      ),
    ),
    ...value.memberIds.map(
      (memberId): Entity => ({
        id:
          oldAttendance.find((a) => a.memberId === memberId)?.id ||
          crypto.randomUUID(),
        kind: "attendance",
        date: value.date,
        meal: value.meal,
        memberId,
      }),
    ),
  ];
  return {
    upsert,
    archive: [...previous, ...linked]
      .filter((r) => !upsert.some((u) => u.id === r.id))
      .map((r) => r.id),
  };
}
