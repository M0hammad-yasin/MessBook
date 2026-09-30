import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/auth";
import { requirePermission, AccessError } from "@/lib/access";
import { listUsers, updateUser } from "@/lib/user-service";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Unable to manage users" },
    { status: e instanceof AccessError ? e.status : 400 },
  );
}
export async function GET(request: Request) {
  try {
    await requirePermission("users:manage");
    return NextResponse.json(
      await listUsers(new URL(request.url).searchParams),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requirePermission("users:manage");
    return NextResponse.json(await updateUser(actor.id, await request.json()));
  } catch (e) {
    return failure(e);
  }
}
