import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, createSession } from "@/lib/auth";
import { registerUser } from "@/lib/registration-service";
import { AccessError } from "@/lib/access";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const id = await registerUser(
      await request.json(),
      request.headers.get("cf-connecting-ip") || "local",
    );
    await createSession(id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Enter a name, valid email and a password of 12–128 characters. Role selection is not allowed during sign-up."
            : e instanceof Error
              ? e.message
              : "Unable to sign up",
      },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
