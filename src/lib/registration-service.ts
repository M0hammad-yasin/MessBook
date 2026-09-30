import { z } from "zod";
import { database } from "./db";
import { digest, passwordHash } from "./auth";
import { AccessError } from "./access";
export const registrationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    qaum: z.string().trim().max(100).optional(),
    email: z
      .email()
      .max(200)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
export async function registerUser(input: unknown, ip: string) {
  const data = registrationSchema.parse(input);
  const { raw } = await database();
  if (!(await raw.prepare("SELECT id FROM users LIMIT 1").first()))
    throw new AccessError(
      "Create the initial workspace before signing up",
      409,
    );
  const key = await digest("signup:" + ip),
    now = Date.now();
  await raw
    .prepare(
      "INSERT INTO login_attempts(key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END",
    )
    .bind(key, now + 900000, now, now, now + 900000)
    .run();
  const bucket = await raw
    .prepare("SELECT attempts FROM login_attempts WHERE key=?")
    .bind(key)
    .first<{ attempts: number }>();
  if ((bucket?.attempts || 0) > 10)
    throw new AccessError("Too many sign-ups. Try again in 15 minutes.", 429);
  const id = crypto.randomUUID(),
    hash = await passwordHash(data.password);
  const result = await raw
    .prepare(
      "INSERT INTO users(id,email,password_hash,name,qaum,role) VALUES(?,?,?,?,?,'user') ON CONFLICT(email) DO NOTHING",
    )
    .bind(id, data.email, hash, data.name, data.qaum || null)
    .run();
  if (!result.meta.changes)
    throw new AccessError(
      "An account with this email already exists. Please sign in.",
      409,
    );
  return id;
}
