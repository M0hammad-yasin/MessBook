import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "@/lib/db";
import { checkOrigin, session } from "@/lib/auth";
import { records, meta } from "@/db/schema";
import { prepareEntity, validateState } from "@/lib/validation";
import type { Entity } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!(await session()))
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const { orm } = await database();
    // D1 batch provides a consistent view of records and the revision used for optimistic concurrency.
    const [rows, versions] = await orm.batch([
      orm.select().from(records).where(eq(records.deleted, 0)),
      orm.select().from(meta).where(eq(meta.id, 1)),
    ]);
    return NextResponse.json(
      { records: rows.map((r) => r.payload), revision: versions[0].revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load records" },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await session();
    if (!user)
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    if (Number(request.headers.get("content-length") || 0) > 500000)
      throw new Error("Request is too large");
    const body = z
      .object({
        revision: z.number().int().min(0),
        upsert: z.array(z.unknown()).max(500),
        archive: z.array(z.string().min(1).max(100)).max(500),
      })
      .parse(await request.json());
    const { raw, orm } = await database();
    const [rows, version] = await orm.batch([
      orm.select().from(records),
      orm.select().from(meta),
    ]);
    if (version[0].revision !== body.revision)
      return NextResponse.json(
        { error: "Someone changed these records. Refresh before saving." },
        { status: 409 },
      );
    const existing = rows.filter((r) => !r.deleted).map((r) => r.payload);
    const upsert = body.upsert.map((e) => prepareEntity(e, existing));
    const changedIds = [...upsert.map((e) => e.id), ...body.archive];
    if (rows.some((r) => r.deleted && changedIds.includes(r.id)))
      throw new Error("Archived record IDs cannot be reused");
    if (body.archive.some((id) => !existing.some((e) => e.id === id)))
      throw new Error("Record to archive was not found");
    if (new Set(changedIds).size !== changedIds.length)
      throw new Error("Duplicate changes in request");
    if (
      body.archive.some(
        (id) => existing.find((e) => e.id === id)?.kind === "member",
      )
    )
      throw new Error(
        "Set the member status to Archived to retain their history",
      );
    const next: Entity[] = [
      ...existing.filter((r) => !changedIds.includes(r.id)),
      ...upsert,
    ];
    validateState(next);
    const token = crypto.randomUUID();
    const at = new Date().toISOString();
    const statements = [
      raw
        .prepare(
          "UPDATE meta SET revision=revision+1,mutation_id=? WHERE id=1 AND revision=?",
        )
        .bind(token, body.revision),
    ];
    // JSON batching keeps bulk attendance below the Free plan's per-request query limit.
    statements.push(
      raw
        .prepare(
          "INSERT INTO records(id,kind,payload,deleted) SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),value,0 FROM json_each(?) WHERE EXISTS(SELECT 1 FROM meta WHERE id=1 AND mutation_id=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted=0",
        )
        .bind(JSON.stringify(upsert), token),
    );
    statements.push(
      raw
        .prepare(
          "UPDATE records SET deleted=1 WHERE id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM meta WHERE id=1 AND mutation_id=?)",
        )
        .bind(JSON.stringify(body.archive), token),
    );
    const changes = changedIds.map((id) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      action: body.archive.includes(id)
        ? "archive"
        : existing.some((e) => e.id === id)
          ? "update"
          : "create",
      recordId: id,
      at,
      oldValue: JSON.stringify(existing.find((e) => e.id === id) || null),
      newValue: JSON.stringify(upsert.find((e) => e.id === id) || null),
    }));
    statements.push(
      raw
        .prepare(
          "INSERT INTO audit(id,user_id,action,record_id,at,old_value,new_value) SELECT json_extract(value,'$.id'),json_extract(value,'$.userId'),json_extract(value,'$.action'),json_extract(value,'$.recordId'),json_extract(value,'$.at'),json_extract(value,'$.oldValue'),json_extract(value,'$.newValue') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM meta WHERE id=1 AND mutation_id=?)",
        )
        .bind(JSON.stringify(changes), token),
    );
    const result = await raw.batch(statements);
    if (!result[0].meta.changes)
      return NextResponse.json(
        { error: "Concurrent update detected. Refresh before saving." },
        { status: 409 },
      );
    return NextResponse.json({ records: next, revision: body.revision + 1 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to save",
      },
      { status: 400 },
    );
  }
}
