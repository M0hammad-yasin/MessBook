import type { Entity } from "./domain";
import { buildMealChanges } from "./meal-service";
import { buildExpenseChanges } from "./expense-service";
import { synchronizeCredits, isAutomaticCredit } from "./payment-service";
import { validateState } from "./validation";
export function prepareRecordMutation(
  body: { meal?: unknown; upsert: unknown[]; archive: string[] },
  existing: Entity[],
) {
  if (body.meal && (body.upsert.length || body.archive.length))
    throw new Error("Save a meal separately from other records");
  const changes = body.meal
    ? buildMealChanges(body.meal, existing)
    : buildExpenseChanges(body.upsert, body.archive, existing);
  const ids = [...changes.upsert.map((r) => r.id), ...changes.archive];
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate changes in request");
  if (changes.archive.some((id) => !existing.some((r) => r.id === id)))
    throw new Error("Record to archive was not found");
  if (
    changes.archive.some(
      (id) => existing.find((r) => r.id === id)?.kind === "member",
    )
  )
    throw new Error(
      "Keep the member and record their departure to preserve history",
    );
  const candidate = [
    ...existing.filter((r) => !ids.includes(r.id)),
    ...changes.upsert,
  ];
  const next = synchronizeCredits(candidate);
  validateState(next);
  const old = new Map(existing.map((r) => [r.id, r]));
  const nextIds = new Set(next.map((r) => r.id));
  return {
    next,
    upsert: next.filter(
      (r) => JSON.stringify(r) !== JSON.stringify(old.get(r.id)),
    ),
    archive: existing.filter((r) => !nextIds.has(r.id)).map((r) => r.id),
  };
}
export { isAutomaticCredit };
