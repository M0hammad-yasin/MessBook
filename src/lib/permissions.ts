export const roles = ["user", "moderator", "admin"] as const;
export type Role = (typeof roles)[number];
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  qaum?: string | null;
  role: Role;
};
export type Permission = "records:write" | "users:manage" | "audit:read";
const grants: Record<Permission, readonly Role[]> = {
  "records:write": ["moderator", "admin"],
  "users:manage": ["admin"],
  "audit:read": ["moderator", "admin"],
};
export function can(role: string | null | undefined, permission: Permission) {
  return grants[permission].includes(role as Role);
}
export function normalizeRole(role: unknown): Role {
  return roles.includes(role as Role) ? (role as Role) : "user";
}
