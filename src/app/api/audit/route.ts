import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { database } from "@/lib/db";
import { can } from "@/lib/permissions";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await session();
  if (!can(user?.role, "audit:read"))
    return NextResponse.json(
      { error: "Activity history requires moderator or administrator access" },
      { status: user ? 403 : 401 },
    );
  const params = new URL(request.url).searchParams;
  const before = params.get("before") || "9999";
  const beforeId = params.get("id") || "\uffff";
  const { raw } = await database();
  const result = await raw
    .prepare(
      "SELECT audit.*, users.name AS user_name FROM audit LEFT JOIN users ON users.id=audit.user_id WHERE audit.at<? OR (audit.at=? AND audit.id<?) ORDER BY audit.at DESC,audit.id DESC LIMIT 200",
    )
    .bind(before, before, beforeId)
    .all();
  return NextResponse.json(result.results, {
    headers: { "Cache-Control": "no-store" },
  });
}
