import { session } from "./auth";
import { can, type Permission } from "./permissions";
export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requirePermission(permission: Permission) {
  const user = await session();
  if (!user) throw new AccessError("Please sign in", 401);
  if (!can(user.role, permission))
    throw new AccessError(
      "Your account is view-only. An administrator must approve write access.",
      403,
    );
  return user;
}
