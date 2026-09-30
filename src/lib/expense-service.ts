import type { Entity } from "./domain";
import { prepareEntity } from "./validation";

export function buildExpenseChanges(
  input: unknown[],
  archive: string[],
  records: Entity[],
) {
  const upsert = input.map((r) => prepareEntity(r, records));
  if (
    upsert.some(
      (r) =>
        r.id.startsWith("credit:") ||
        (r.kind === "payment" && (r.sourceId || r.type === "Purchase credit")),
    ) ||
    archive.some((id) => id.startsWith("credit:"))
  )
    throw new Error(
      "Automatic purchase credits are managed by their source expense. Edit that expense instead.",
    );
  if (
    upsert.some(
      (r) =>
        r.kind === "food" || r.kind === "cooking" || r.kind === "attendance",
    ) ||
    archive.some((id) =>
      records.some(
        (r) =>
          r.id === id &&
          (r.kind === "food" ||
            r.kind === "cooking" ||
            r.kind === "attendance"),
      ),
    )
  )
    throw new Error(
      "Use the meal editor to change ingredients, rates or attendance together",
    );
  // Replacing historical funding with a buyer transfers, rather than duplicates, the credit.
  const replaced = upsert
    .filter((r) => r.kind === "shared" && r.paidBy !== undefined)
    .map((r) => r.id);
  const linked = records
    .filter(
      (r) =>
        r.kind === "purchase" &&
        r.appliedTo !== "General credit" &&
        (archive.includes(r.expenseId) || replaced.includes(r.expenseId)),
    )
    .map((r) => r.id);
  return { upsert, archive: [...new Set([...archive, ...linked])] };
}
