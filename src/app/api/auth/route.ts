import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  checkOrigin,
  constantEqual,
  createSession,
  digest,
  passwordHash,
  session,
} from "@/lib/auth";
import { database } from "@/lib/db";
import { USER_ROLES } from "@/db/schema";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { raw } = await database();
    const user = await session();
    const exists = await raw.prepare("SELECT id FROM users LIMIT 1").first();
    return NextResponse.json(
      { user, needsSetup: !exists },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Database unavailable. Apply the local D1 migration to get started.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = z
      .object({
        email: z
          .email()
          .max(200)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(12).max(128),
        name: z.string().min(2).max(100).optional(),
        qaum: z.string().max(100).optional(),
        role: z.enum(USER_ROLES).optional(),
        setupToken: z.string().max(200).optional(),
      })
      .parse(await request.json());
    const { raw, setupToken } = await database();
    const now = Date.now();
    // IP and account buckets limit guessing, including guesses spread across different accounts/IPs.
    const keys = await Promise.all([
      digest("ip:" + (request.headers.get("cf-connecting-ip") || "local")),
      digest("email:" + body.email),
    ]);
    await raw.batch(
      keys.map((key) =>
        raw
          .prepare(
            "INSERT INTO login_attempts(key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END",
          )
          .bind(key, now + 15 * 60000, now, now, now + 15 * 60000),
      ),
    );
    for (const key of keys) {
      const limit = await raw
        .prepare("SELECT attempts FROM login_attempts WHERE key=?")
        .bind(key)
        .first<{ attempts: number }>();
      if ((limit?.attempts || 0) > 10)
        return NextResponse.json(
          { error: "Too many attempts. Try again in 15 minutes." },
          { status: 429 },
        );
    }
    let user = await raw
      .prepare("SELECT id,password_hash FROM users WHERE email=?")
      .bind(body.email)
      .first<{ id: string; password_hash: string }>();
    if (body.setupToken) {
      if (
        !setupToken ||
        !constantEqual(body.setupToken, setupToken) ||
        !body.name
      )
        return NextResponse.json(
          { error: "Invalid setup credentials" },
          { status: 403 },
        );
      const hash = await passwordHash(body.password);
      const id = crypto.randomUUID();
      // First user (workspace owner) always receives the admin role.
      // Any future user creation outside setup should default to "user".
      const created = await raw
        .prepare(
          "INSERT INTO users(id,email,password_hash,name,qaum,role) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM users)",
        )
        .bind(id, body.email, hash, body.name, body.qaum || null, body.role || "admin")
        .run();
      if (!created.meta.changes)
        return NextResponse.json(
          { error: "Setup has already been completed" },
          { status: 409 },
        );
      user = { id, password_hash: hash };
    } else {
      const hash = await passwordHash(
        body.password,
        user?.password_hash.split(":")[0] || "fixed-dummy-salt-for-timing",
      );
      if (!user || !constantEqual(hash, user.password_hash))
        return NextResponse.json(
          { error: "Email or password is incorrect" },
          { status: 401 },
        );
    }
    await createSession(user!.id);
    await raw.batch(
      keys.map((key) =>
        raw.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (process.env.NODE_ENV === "development")
      console.error(
        "Authentication error:",
        error instanceof Error ? error.message : "Unknown error",
      );
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "Use a valid email and a password of 12–128 characters."
            : "Unable to sign in. Check setup and try again.",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const token = (await cookies()).get("messbook_session")?.value;
    if (token) {
      const { raw } = await database();
      await raw
        .prepare("DELETE FROM sessions WHERE hash=?")
        .bind(await digest(token))
        .run();
    }
    (await cookies()).delete("messbook_session");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Sign out failed" }, { status: 400 });
  }
}
