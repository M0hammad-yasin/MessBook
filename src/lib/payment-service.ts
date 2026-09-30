import type { Entity, Payment } from "./domain";
export function isAutomaticCredit(
  record: Entity,
): record is Payment & { sourceId: string } {
  return (
    record.kind === "payment" &&
    record.type === "Purchase credit" &&
    !!record.sourceId
  );
}
/** The expense is authoritative. Credits are persisted projections with stable source links. */
export function synchronizeCredits(records: Entity[]): Entity[] {
  const retained = records.filter((r) => !isAutomaticCredit(r));
  const credits: Payment[] = [];
  for (const expense of retained) {
    if (
      (expense.kind !== "food" &&
        expense.kind !== "fuel" &&
        expense.kind !== "shared") ||
      !expense.paidBy
    )
      continue;
    credits.push({
      id: `credit:${expense.id}`,
      kind: "payment",
      type: "Purchase credit",
      sourceId: expense.id,
      date:
        expense.kind === "food" ? expense.paidAt || expense.date : expense.date,
      memberId: expense.paidBy,
      amount: expense.amount,
      method: "Other",
      reference: expense.id,
      notes: `Paid for ${expense.kind === "fuel" ? expense.resource : expense.description}`,
    });
  }
  return [...retained, ...credits];
}
