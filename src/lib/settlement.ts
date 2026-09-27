import {
  byKind,
  type Entity,
  type LedgerLine,
  type MealSummary,
} from "./domain";

// All monetary values are integer paisa. Largest-remainder apportionment preserves every paisa.
export function allocate(
  total: number,
  weights: { id: string; weight: number }[],
): Record<string, number> {
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Invalid amount");
  if (weights.some((w) => !Number.isFinite(w.weight) || w.weight < 0))
    throw new Error("Invalid allocation weight");
  const sum = weights.reduce((n, w) => n + w.weight, 0);
  if (!sum) {
    if (total)
      throw new Error(
        "Allocation requires positive stay units or participating members",
      );
    return Object.fromEntries(weights.map((w) => [w.id, 0]));
  }
  const shares = weights
    .map((w) => ({
      id: w.id,
      value: Math.floor((total * w.weight) / sum),
      remainder: ((total * w.weight) / sum) % 1,
    }))
    .sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  const left = total - shares.reduce((n, s) => n + s.value, 0);
  shares.forEach((s, i) => {
    if (i < left) s.value++;
  });
  return Object.fromEntries(shares.map((s) => [s.id, s.value]));
}

export function calculate(records: Entity[], through = "9999-12-31") {
  const members = byKind(records, "member");
  const lines: LedgerLine[] = [];
  const warnings: string[] = [];
  const mealSummaries: MealSummary[] = [];
  const add = (
    id: string,
    memberId: string,
    date: string,
    category: LedgerLine["category"],
    description: string,
    debit = 0,
    credit = 0,
  ) => {
    if (date <= through)
      lines.push({
        id,
        memberId,
        date,
        category,
        description,
        debit,
        credit,
        balance: 0,
      });
  };
  members.forEach((m) => {
    if (m.openingCredit)
      add(
        `opening-${m.id}`,
        m.id,
        m.arrival.slice(0, 10),
        "Opening",
        "Opening credit",
        0,
        m.openingCredit,
      );
  });
  const food = byKind(records, "food"),
    cooking = byKind(records, "cooking"),
    attendance = byKind(records, "attendance");
  const keys = new Set(
    [...food, ...cooking, ...attendance].map((x) => `${x.date}|${x.meal}`),
  );
  const fuelCharged: Record<string, number> = {};
  for (const key of [...keys].sort()) {
    const [date, meal] = key.split("|") as [string, MealSummary["meal"]];
    if (date > through) continue;
    const match = (r: { date: string; meal: string }) =>
      r.date === date && r.meal === meal;
    const eaters = [
      ...new Set(attendance.filter(match).map((a) => a.memberId)),
    ].sort();
    const amount = food.filter(match).reduce((n, e) => n + e.amount, 0);
    const log = cooking.find(match);
    const oil = log?.oilRate || 0;
    const gas = log?.gasRate || 0;
    const total = amount + oil + gas;
    mealSummaries.push({
      date,
      meal,
      eaters: eaters.length,
      food: amount,
      oil,
      gas,
      total,
      perEater: eaters.length ? total / eaters.length : 0,
      oilId: log?.oilId || "",
      gasId: log?.gasId || "",
    });
    if (!eaters.length) {
      if (total)
        warnings.push(
          `${date} ${meal}: expense exists but no residents are marked for this meal.`,
        );
      continue;
    }
    for (const [category, value, fuelId] of [
      ["Food", amount, ""],
      ["Oil", oil, log?.oilId],
      ["Gas", gas, log?.gasId],
    ] as const) {
      if (!value) continue;
      const shares = allocate(
        value,
        eaters.map((id) => ({ id, weight: 1 })),
      );
      for (const id of eaters)
        add(
          `${key}-${category}-${id}`,
          id,
          date,
          category,
          `${meal} · ${category === "Food" ? "meal expenses" : category + " cooking rate"}`,
          shares[id],
        );
      if (fuelId) fuelCharged[fuelId] = (fuelCharged[fuelId] || 0) + value;
    }
  }
  byKind(records, "fuel")
    .filter((e) => e.tier === "divide_by_people")
    .forEach((e) => {
      if (e.date > through) return;
      const shares = allocate(
        e.amount,
        e.memberIds.map((id) => ({ id, weight: 1 })),
      );
      e.memberIds.forEach((id) =>
        add(
          `${e.id}-${id}`,
          id,
          e.date,
          e.resource,
          `${e.resource} · direct purchase split`,
          shares[id],
        ),
      );
      fuelCharged[e.id] = e.amount;
    });
  byKind(records, "shared").forEach((e) => {
    if (e.method === "Excluded") return;
    const shares =
      e.method === "Manual"
        ? e.manual
        : allocate(
            e.amount,
            e.memberIds.map((id) => ({
              id,
              weight:
                e.method === "Equal"
                  ? 1
                  : members.find((m) => m.id === id)?.stayUnits || 0,
            })),
          );
    e.memberIds.forEach((id) =>
      add(
        `${e.id}-${id}`,
        id,
        e.date,
        "Shared",
        `${e.category} · ${e.description}`,
        shares[id] || 0,
      ),
    );
  });
  byKind(records, "payment").forEach((e) =>
    add(
      e.id,
      e.memberId,
      e.date,
      "Payment",
      `${e.type} · ${e.method}${e.reference ? " · " + e.reference : ""}`,
      e.type === "Deposit" ? 0 : e.amount,
      e.type === "Deposit" ? e.amount : 0,
    ),
  );
  byKind(records, "purchase").forEach((e) =>
    add(
      e.id,
      e.memberId,
      e.date,
      "Purchase",
      `Personal purchase · ${e.description}`,
      0,
      e.amount,
    ),
  );
  lines.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.category === "Opening") - Number(a.category === "Opening") ||
      a.id.localeCompare(b.id),
  );
  const balances: Record<string, number> = {};
  lines.forEach((l) => {
    balances[l.memberId] = (balances[l.memberId] || 0) + l.debit - l.credit;
    l.balance = balances[l.memberId];
  });
  const settlements = members.map((m) => {
    const own = lines.filter((l) => l.memberId === m.id);
    return {
      ...m,
      food: own
        .filter((l) => l.category === "Food")
        .reduce((n, l) => n + l.debit, 0),
      fuel: own
        .filter((l) => l.category === "Oil" || l.category === "Gas")
        .reduce((n, l) => n + l.debit, 0),
      shared: own
        .filter((l) => l.category === "Shared")
        .reduce((n, l) => n + l.debit, 0),
      credit: own.reduce(
        (n, l) => n + l.credit - (l.category === "Payment" ? l.debit : 0),
        0,
      ),
      balance: balances[m.id] || 0,
    };
  });
  return { lines, settlements, warnings, mealSummaries, fuelCharged };
}
