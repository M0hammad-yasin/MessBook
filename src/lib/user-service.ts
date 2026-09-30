import { z } from "zod";
import { database } from "./db";
import { roles, type Role } from "./permissions";
import { AccessError } from "./access";
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  qaum: string | null;
  role: Role;
  version: number;
};
const updateSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(2).max(100),
    role: z.enum(roles),
    version: z.number().int().min(0),
  })
  .strict();
export async function listUsers(params: URLSearchParams) {
  const q = (params.get("q") || "").slice(0, 200),
    role = params.get("role") || "";
  const afterName = params.get("afterName") || "",
    afterId = params.get("afterId") || "";
  const { raw } = await database();
  const result = await raw
    .prepare(
      "SELECT id,name,email,qaum,role,version FROM users WHERE (?='' OR instr(lower(name || ' ' || email || ' ' || coalesce(qaum,'')),lower(?))>0) AND (?='' OR role=?) AND (?='' OR name>? OR (name=? AND id>?)) ORDER BY name,id LIMIT 51",
    )
    .bind(q, q, role, role, afterId, afterName, afterName, afterId)
    .all<ManagedUser>();
  const users = result.results.slice(0, 50),
    last = users.at(-1);
  return {
    users,
    next:
      result.results.length > 50 && last
        ? { name: last.name, id: last.id }
        : null,
  };
}
export async function updateUser(actorId: string, input: unknown) {
  const data = updateSchema.parse(input),
    { raw } = await database();
  const old = await raw
    .prepare("SELECT id,name,email,qaum,role,version FROM users WHERE id=?")
    .bind(data.id)
    .first<ManagedUser>();
  if (!old) throw new AccessError("User not found", 404);
  const token = crypto.randomUUID();
  const result = await raw.batch([
    raw
      .prepare(
        "UPDATE users SET name=?,role=?,version=version+1,mutation_id=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin') AND (?='admin' OR role<>'admin' OR (SELECT count(*) FROM users WHERE role='admin')>1)",
      )
      .bind(
        data.name,
        data.role,
        token,
        data.id,
        data.version,
        actorId,
        data.role,
      ),
    raw
      .prepare(
        "INSERT INTO audit(id,user_id,action,record_id,at,old_value,new_value) SELECT ?,?,'user-update',?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND mutation_id=?)",
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        `user:${data.id}`,
        new Date().toISOString(),
        JSON.stringify(old),
        JSON.stringify({
          ...old,
          name: data.name,
          role: data.role,
          version: data.version + 1,
        }),
        data.id,
        token,
      ),
  ]);
  if (!result[0].meta.changes)
    throw new AccessError(
      "This user changed, your permission changed, or this is the last administrator. Refresh and keep at least one admin.",
      409,
    );
  return {
    ...old,
    name: data.name,
    role: data.role,
    version: data.version + 1,
  };
}
