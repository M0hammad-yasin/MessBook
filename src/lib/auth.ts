import { cookies } from "next/headers";
import { database } from "./db";
import { normalizeRole, type SessionUser } from "./permissions";
import type { UserRole } from "@/db/schema";
const encoder = new TextEncoder();
export const hex = (buffer: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
export function constantEqual(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
export async function passwordHash(password: string, salt = randomToken()) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `${salt}:${hex(bits)}`;
}
export async function session() {
  const token = (await cookies()).get("messbook_session")?.value;
  if (!token) return null;
  const { raw } = await database();
  const user = await raw
    .prepare(
      "SELECT users.id, users.name, users.email, users.qaum, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?",
    )
    .bind(await digest(token), Date.now())
    .first<{
      id: string;
      name: string;
      email: string;
      qaum?: string | null;
      role?: UserRole | null;
    }>();
  return user
    ? ({ ...user, role: normalizeRole(user.role) } as SessionUser)
    : null;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next dev may expose its bind address (0.0.0.0) in request.url; Host retains the requested origin.
  const host = request.headers.get("host");
  if (host) expected.host = host;
  if (!origin || origin !== expected.origin)
    throw new Error("Untrusted request origin");
}
export async function createSession(userId: string) {
  const token = randomToken();
  const { raw } = await database();
  await raw.batch([
    raw.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
    raw
      .prepare("INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)")
      .bind(await digest(token), userId, Date.now() + 7 * 86400000),
  ]);
  (await cookies()).set("messbook_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400,
  });
}
