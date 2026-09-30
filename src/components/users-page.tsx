"use client";
import { useEffect, useState } from "react";
import { usersApi } from "@/lib/api";
import type { ManagedUser } from "@/lib/user-service";
import { roles, type Role } from "@/lib/permissions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DataTable } from "./data-table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function UsersPage({
  onChanged,
  demo = false,
}: {
  onChanged: () => Promise<void>;
  demo?: boolean;
}) {
  const [rows, setRows] = useState<ManagedUser[]>([]),
    [q, setQ] = useState(""),
    [role, setRole] = useState(""),
    [next, setNext] = useState<{ name: string; id: string } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<ManagedUser | null>(null);
  async function load(append = false) {
    if (demo) return;
    setBusy(true);
    setError("");
    try {
      const result = await usersApi.list({
        q,
        role,
        ...(append && next ? { afterName: next.name, afterId: next.id } : {}),
      });
      setRows((old) => (append ? [...old, ...result.users] : result.users));
      setNext(result.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load accounts");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(async () => {
      if (demo) {
        setBusy(false);
        return;
      }
      try {
        const result = await usersApi.list({ q, role });
        if (live) {
          setRows(result.users);
          setNext(result.next);
          setError("");
        }
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Unable to load accounts");
      } finally {
        if (live) setBusy(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, role, demo]);
  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-500">
        Accounts control access to the app. Mess members and their stays are
        managed separately. Promote an approved user to Moderator to let them
        record meals and expenses.
      </p>
      {demo && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm">
          User administration is available in your real workspace.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label="Search users"
          placeholder="Search name, email or qaum"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Filter user role"
          className="control w-auto"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <Button variant="outline" disabled={busy} onClick={() => load()}>
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <DataTable
        rows={rows}
        columns={[
          { accessorKey: "name", header: "Name" },
          { accessorKey: "email", header: "Email" },
          { accessorKey: "qaum", header: "Qaum" },
          { accessorKey: "role", header: "Role" },
          {
            id: "edit",
            header: "",
            cell: ({ row }) => (
              <Button
                variant="ghost"
                onClick={() => setEditing({ ...row.original })}
              >
                Edit access
              </Button>
            ),
          },
        ]}
        filename="messbook-accounts"
      />
      {next && (
        <Button disabled={busy} onClick={() => load(true)}>
          Load more accounts
        </Button>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            Edit account
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-stone-500">
            User: view only. Moderator: read and write. Admin: full access,
            including user management.
          </DialogDescription>
          {editing && (
            <form
              className="mt-5 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await usersApi.update({
                    id: editing.id,
                    name: editing.name,
                    role: editing.role,
                    version: editing.version,
                  });
                  setEditing(null);
                  await onChanged();
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to update");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Name
                <Input
                  required
                  minLength={2}
                  maxLength={100}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Role
                <select
                  aria-label="Account role"
                  className="control"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as Role })
                  }
                >
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button disabled={busy}>Save account</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
