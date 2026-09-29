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
    const migrated = migrateRecords(rows.map((r) => r.payload));
    const changes = migrated.flatMap((payload, i) =>
      JSON.stringify(payload) === JSON.stringify(rows[i].payload)
        ? []
        : [
            {
              id: crypto.randomUUID(),
              recordId: payload.id,
              oldValue: JSON.stringify(rows[i].payload),
              newValue: JSON.stringify(payload),
            },
          ],
    );
    if (!changes.length) return;
    const token = crypto.randomUUID();
    const result = await raw.batch([
      raw
        .prepare(
          "UPDATE meta SET revision=revision+1,mutation_id=? WHERE id=1 AND revision=?",
        )
        .bind(token, versions[0].revision),
      raw
        .prepare(
          "UPDATE records SET payload=(SELECT json_extract(value,'$.newValue') FROM json_each(?) WHERE json_extract(value,'$.recordId')=records.id) WHERE id IN (SELECT json_extract(value,'$.recordId') FROM json_each(?)) AND EXISTS(SELECT 1 FROM meta WHERE mutation_id=?)",
        )
        .bind(JSON.stringify(changes), JSON.stringify(changes), token),
      raw
        .prepare(
          "INSERT INTO audit(id,user_id,action,record_id,at,old_value,new_value) SELECT json_extract(value,'$.id'),?,'migrate',json_extract(value,'$.recordId'),?,json_extract(value,'$.oldValue'),json_extract(value,'$.newValue') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM meta WHERE mutation_id=?)",
        )
        .bind(userId, new Date().toISOString(), JSON.stringify(changes), token),
    ]);
    if (result[0].meta.changes) return;
  }
  throw new Error("Records changed during migration. Please refresh.");
}
