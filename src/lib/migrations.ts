import type { Entity } from "./domain";
import { allocate } from "./settlement";
import { synchronizeCredits } from "./payment-service";
import { memberStays } from "./stays";

/** Preserve historical allocations before removing the legacy member weight. */
export function migrateRecords(input: Entity[]): Entity[] {
  const legacy = input as (Entity & { stayUnits?: number })[];
  const normalized = legacy.map((record): Entity => {
    if (record.kind === "member") {
      const { stayUnits: _removed, ...member } = record;
      return { ...member, stays: memberStays(member) };
    }
    if (record.kind === "shared" && String(record.method) === "Stay units") {
      return {
        ...record,
        method: "Manual",
        manual: allocate(
          record.amount,
          record.memberIds.map((id) => ({
            id,
            weight: legacy.find((r) => r.id === id)?.stayUnits || 0,
          })),
        ),
      };
    }
    return record;
  });
  return synchronizeCredits(normalized);
}
