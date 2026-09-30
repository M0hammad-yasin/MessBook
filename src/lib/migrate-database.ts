import { database } from "./db";
import { records, meta } from "../db/schema";
import { migrateRecords } from "./migrations";

/** Optimistic, atomic migration; original payloads remain in the audit trail. */
export async function migrateDatabase(userId: string) {
  const { raw, orm } = await database();
  for (let attempt = 0; attempt < 3; attempt++) {
    const [rows, versions] = await orm.batch([
      orm.select().from(records),
      orm.select().from(meta),
    ]);
    const active = rows.filter((r) => !r.deleted);
    const old = new Map(active.map((r) => [r.id, r.payload]));
    const migrated = migrateRecords(active.map((r) => r.payload));
    const changes = migrated.flatMap((payload) =>
      JSON.stringify(payload) === JSON.stringify(old.get(payload.id))
        ? []
        : [
            {
              id: crypto.randomUUID(),
              recordId: payload.id,
              oldValue: JSON.stringify(old.get(payload.id) || null),
              newValue: JSON.stringify(payload),
            },
          ],
    );
    const nextIds = new Set(migrated.map((r) => r.id));
    const removed = active.filter((r) => !nextIds.has(r.id));
    if (!changes.length && !removed.length) return;
    const token = crypto.randomUUID();
    const result = await raw.batch([
      raw
        .prepare(
          "UPDATE meta SET revision=revision+1,mutation_id=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role IN ('admin','moderator'))",
        )
        .bind(token, versions[0].revision, userId),
      raw
        .prepare(
          "INSERT INTO records(id,kind,payload,deleted) SELECT json_extract(value,'$.recordId'),json_extract(json_extract(value,'$.newValue'),'$.kind'),json_extract(value,'$.newValue'),0 FROM json_each(?) WHERE EXISTS(SELECT 1 FROM meta WHERE mutation_id=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted=0",
        )
        .bind(JSON.stringify(changes), token),
      raw
        .prepare(
          "UPDATE records SET deleted=1 WHERE id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM meta WHERE mutation_id=?)",
        )
        .bind(JSON.stringify(removed.map((r) => r.id)), token),
      raw
        .prepare(
          "INSERT INTO audit(id,user_id,action,record_id,at,old_value,new_value) SELECT json_extract(value,'$.id'),?,'migrate',json_extract(value,'$.recordId'),?,json_extract(value,'$.oldValue'),json_extract(value,'$.newValue') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM meta WHERE mutation_id=?)",
        )
        .bind(
          userId,
          new Date().toISOString(),
          JSON.stringify([
            ...changes,
            ...removed.map((r) => ({
              id: crypto.randomUUID(),
              recordId: r.id,
              oldValue: JSON.stringify(r.payload),
              newValue: "null",
            })),
          ]),
          token,
        ),
    ]);
    if (result[0].meta.changes) return;
  }
  throw new Error("Records changed during migration. Please refresh.");
}
