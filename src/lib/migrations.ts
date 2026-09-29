import type { Entity } from "./domain";
import { allocate } from "./settlement";

/** Preserve historical allocations before removing the legacy member weight. */
export function migrateRecords(input: Entity[]): Entity[] {
  const legacy = input as (Entity & { stayUnits?: number })[];
  return legacy.map((record) => {
    if (record.kind === "member" && "stayUnits" in record) {
      const { stayUnits: _removed, ...member } = record;
      return member;
    }
    if (record.kind === "shared" && String(record.method) === "Stay units") {
      return { ...record, method: "Manual", manual: allocate(record.amount,
        record.memberIds.map((id) => ({ id, weight: legacy.find((r) => r.id === id)?.stayUnits || 0 }))) };
    }
    return record;
  });
}
