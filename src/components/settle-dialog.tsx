"use client";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { pkr, today, type Entity } from "@/lib/domain";
import { entitySchema } from "@/lib/validation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export type SettleMember = {
  id: string;
  name: string;
  status: string;
  balance: number;
};

const describe = (balance: number) =>
  balance > 0
    ? `owes ${pkr(balance)}`
    : balance < 0
      ? `has ${pkr(-balance)} credit`
      : "settled";

export function SettleDialog({
  member,
  members,
  onClose,
  onSave,
}: {
  member: SettleMember;
  members: SettleMember[];
  onClose: () => void;
  onSave: (entity: Entity) => Promise<unknown>;
}) {
  // A member in credit can only waive it; cash is for settling a due.
  const owes = member.balance > 0;
  const [mode, setMode] = useState<"cash" | "settled">(owes ? "cash" : "settled");
  const [amount, setAmount] = useState(String(Math.abs(member.balance) / 100));
  const [receiverId, setReceiverId] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const paisa = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(paisa) && paisa > 0;
  const receiver = members.find((m) => m.id === receiverId);
  const others = members.filter(
    (m) => m.id !== member.id && m.status !== "Archived",
  );
  const settleMode = owes ? "forgive_due" : "waive_credit";
  const memberAfter = owes ? member.balance - paisa : member.balance + paisa;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!valid) throw new Error("Enter an amount greater than zero");
      if (mode === "settled" && paisa > Math.abs(member.balance))
        throw new Error(
          `You can settle at most ${pkr(Math.abs(member.balance))}, which is the current balance`,
        );
      if (mode === "cash" && !receiverId)
        throw new Error("Choose who received the cash");
      if (mode === "settled" && !notes.trim())
        throw new Error("Give a reason for settling this balance");
      const entity = entitySchema.parse({
        id: crypto.randomUUID(),
        kind: "settlement",
        date,
        memberId: member.id,
        mode: mode === "cash" ? "cash" : settleMode,
        ...(mode === "cash" ? { receiverId } : {}),
        amount: paisa,
        notes: notes.trim(),
      }) as Entity;
      setSaving(true);
      await onSave(entity);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle className="pr-8 text-xl font-semibold">
          Settle {member.name}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-stone-500">
          {member.name} currently {describe(member.balance)}. Everything you
          record here stays in the history.
        </DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          {owes && (
            <div
              role="radiogroup"
              aria-label="Settlement type"
              className="grid grid-cols-2 gap-2"
            >
              {(
                [
                  ["cash", "Paid cash"],
                  ["settled", "Settled (forgive)"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    mode === value
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="field">
              <span>
                {mode === "cash"
                  ? `Cash given by ${member.name} (PKR)`
                  : owes
                    ? "Amount to forgive (PKR)"
                    : "Credit to waive (PKR)"}
                <span className="text-emerald-700"> *</span>
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                aria-label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <small>Pre-filled with the current balance.</small>
            </label>
            {mode === "cash" && (
              <label className="field">
                <span>
                  Given to <span className="text-emerald-700">*</span>
                </span>
                <select
                  className="control"
                  required
                  aria-label="Cash received by"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                >
                  <option value="">Select member…</option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {describe(m.balance)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Date</span>
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field sm:col-span-2">
              <span>
                {mode === "cash" ? "Notes" : "Reason"}
                {mode === "settled" && (
                  <span className="text-emerald-700"> *</span>
                )}
              </span>
              <textarea
                className="control min-h-20"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  mode === "settled" ? "e.g. Guest house, no need to settle" : ""
                }
              />
            </label>
          </div>
          {valid && (
            <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
              <p>
                <strong>{member.name}</strong>: {describe(member.balance)} →{" "}
                {describe(memberAfter)}
              </p>
              {mode === "cash" && receiver && (
                <p className="mt-1">
                  <strong>{receiver.name}</strong>: {describe(receiver.balance)}{" "}
                  → {describe(receiver.balance + paisa)} (now holds this cash for
                  the mess)
                </p>
              )}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle size={16} /> {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {mode === "cash" ? "Record cash" : "Settle balance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
