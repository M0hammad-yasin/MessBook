"use client";
import { createContext, useContext, type ReactNode } from "react";
import { can, type Permission, type SessionUser } from "@/lib/permissions";
type Access = { user: SessionUser | null; requestWrite: () => void };
const Context = createContext<Access>({ user: null, requestWrite: () => {} });
export function AccessProvider({
  user,
  requestWrite,
  children,
}: Access & { children: ReactNode }) {
  return (
    <Context.Provider value={{ user, requestWrite }}>
      {children}
    </Context.Provider>
  );
}
export function useAccess() {
  const value = useContext(Context);
  return {
    ...value,
    can: (permission: Permission) => can(value.user?.role, permission),
  };
}
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const access = useAccess();
  return access.can(permission) ? children : fallback;
}
