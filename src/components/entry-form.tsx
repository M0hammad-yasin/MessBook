"use client";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, Users } from "lucide-react";
import {
  byKind,
  meals,
  pkr,
  today,
  type Entity,
  type Kind,
  type Member,
} from "@/lib/domain";
import { entitySchema } from "@/lib/validation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export const kindLabels: Record<Kind, string> = {
  member: "Member",
  attendance: "Attendance",
  food: "Meal",
  fuel: "Oil / gas / chai purchase",
  cooking: "Meal",
  shared: "Shared expense",
  payment: "Payment",
  purchase: "Personal purchase",
};
type FormValues = Record<string, string>;
const inputSchema = z.record(z.string(), z.string());
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  help?: string;
};
const moneyFields = ["amount", "openingCredit", "breakfast", "lunch", "dinner"];
const commonDate: Field = {
  key: "date",
  label: "Date",
  type: "date",
  required: true,
};
const mealField: Field = { key: "meal", label: "Meal", options: [...meals] };
const amountField: Field = {
  key: "amount",
  label: "Amount (PKR)",
  type: "number",
  required: true,
};
const description: Field = {
  key: "description",
  label: "Description",
  required: true,
};
const note: Field = { key: "notes", label: "Notes", type: "textarea" };
export function EntryForm({
  kind,
  editing,
  records,
  defaultDate,
  onClose,
  onSave,
}: {
  kind: Kind;
  editing?: Entity;
  records: Entity[];
  defaultDate?: string;
  onClose: () => void;
  onSave: (entity: Entity) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const members = byKind(records, "member");
  const [selected, setSelected] = useState<string[]>(
    editing && "memberIds" in editing
      ? editing.memberIds
      : kind === "shared"
        ? members.filter((m) => m.status === "Active").map((m) => m.id)
        : [],
  );
  const legacyCredits = editing
    ? byKind(records, "purchase").filter(
        (p) => p.appliedTo !== "General credit" && p.expenseId === editing.id,
      )
    : [];
  const initial: FormValues = {
    paidBy: legacyCredits.length ? "__legacy" : "",
    date: today(),
    meal: "Breakfast",
    amount: "",
    name: "",
    phone: "",
    status: "Active",
    arrival: today() + "T09:00",
    departure: "",
    openingCredit: "0",
    notes: "",
    resource: "Oil",
    tier: "average",
    effective: today(),
    end: "",
    breakfast: "0",
    lunch: "0",
    dinner: "0",
    category: "Electricity",
    description: "",
    method: kind === "payment" ? "Cash" : "Equal",
    type: "Deposit",
    memberId: members[0]?.id || "",
    reference: "",
    appliedTo: "General credit",
    expenseId: "",
    oilId: "",
    gasId: "",
  };
  if (editing)
    for (const [k, v] of Object.entries(editing)) {
      if (typeof v === "string" || typeof v === "number")
        initial[k] = String(moneyFields.includes(k) ? Number(v) / 100 : v);
    }
  if (!editing && defaultDate) initial.date = defaultDate;
  const [manual, setManual] = useState<Record<string, string>>(
    editing?.kind === "shared"
      ? Object.fromEntries(
          Object.entries(editing.manual).map(([k, v]) => [k, String(v / 100)]),
        )
      : {},
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(inputSchema) as Resolver<FormValues>,
    defaultValues: initial,
  });
  const values = form.watch();
  let fields: Field[] = [];
  switch (kind) {
    case "member":
      fields = [
        { key: "name", label: "Full name", required: true },
        { key: "phone", label: "Phone", type: "tel" },
        {
          key: "status",
          label: "Status",
          options: ["Active", "Left", "Archived"],
        },
        {
          key: "arrival",
          label: "Arrival",
          type: "datetime-local",
          required: true,
        },
        { key: "departure", label: "Departure", type: "datetime-local" },
        { key: "openingCredit", label: "Opening credit (PKR)", type: "number" },
        note,
      ];
      break;
    case "food":
      fields = [commonDate, mealField, description, amountField];
      break;
    case "fuel":
      fields = [
        commonDate,
        { key: "resource", label: "Resource", options: ["Oil", "Gas", "Chai"] },
        amountField,
        {
          key: "tier",
          label: "Allocation tier",
          options: ["average", "divide_by_people"],
        },
        ...(values.tier === "average"
          ? [
              {
                key: "effective",
                label: "Effective from",
                type: "date",
                required: true,
              },
              { key: "end", label: "End date (closes entry)", type: "date" },
              ...["breakfast", "lunch", "dinner"].map((key) => ({
                key,
                label: key[0].toUpperCase() + key.slice(1) + " rate (PKR)",
                type: "number",
              })),
            ]
          : []),
        note,
      ];
      break;
    case "shared":
      fields = [
        commonDate,
        {
          key: "category",
          label: "Category",
          options: [
            "Electricity",
            "Water",
            "Cleaning",
            "Internet",
            "Salary",
            "Other",
          ],
        },
        description,
        amountField,
        {
          key: "method",
          label: "Allocation method",
          options: ["Equal", "Manual", "Excluded"],
        },
      ];
      break;
    case "payment":
      fields = [
        commonDate,
        { key: "memberId", label: "Member", options: members.map((m) => m.id) },
        {
          key: "type",
          label: "Payment type",
          options: ["Deposit", "Refund", "Reimbursement"],
        },
        amountField,
        {
          key: "method",
          label: "Payment method",
          options: ["Cash", "Bank", "JazzCash", "Easypaisa", "Other"],
        },
        { key: "reference", label: "Reference" },
        note,
      ];
      break;
    case "purchase":
      fields = [
        commonDate,
        {
          key: "memberId",
          label: "Paid by",
          options: members.map((m) => m.id),
        },
        description,
        amountField,
        {
          key: "appliedTo",
          label: "Applied to",
          options: ["General credit", "Meal expense", "Shared expense"],
        },
        ...(values.appliedTo !== "General credit"
          ? [
              {
                key: "expenseId",
                label: "Existing expense",
                options: records
                  .filter(
                    (r) =>
                      r.kind ===
                      (values.appliedTo === "Meal expense" ? "food" : "shared"),
                  )
                  .map((r) => r.id),
                help: "Links this credit to an expense already recorded. Does not create a second expense.",
              },
            ]
          : []),
      ];
      break;
    case "cooking":
      fields = [commonDate, mealField];
      break;
    case "attendance":
      fields = [
        commonDate,
        mealField,
        { key: "memberId", label: "Member", options: members.map((m) => m.id) },
      ];
  }
  if (kind === "fuel" || kind === "shared")
    fields.splice(3, 0, {
      key: "paidBy",
      label: "Paid by",
      options: [
        ...(legacyCredits.length ? ["__legacy"] : []),
        "",
        ...members
          .filter((m) => m.status === "Active" || m.id === initial.paidBy)
          .map((m) => m.id),
      ],
      help: legacyCredits.length
        ? `Historical credits: ${legacyCredits.map((p) => `${members.find((m) => m.id === p.memberId)?.name}: ${pkr(p.amount)}`).join(", ")}. Choosing a buyer replaces these credits with the full expense amount.`
        : "The selected member receives credit automatically. Choose Mess fund for a purchase paid from mess cash.",
    });
  const labelFor = (key: string, value: string) =>
    key === "paidBy"
      ? value === "__legacy"
        ? "Keep historical buyer credits"
        : value
          ? members.find((m) => m.id === value)?.name
          : "Mess fund"
      : key === "memberId"
        ? members.find((m) => m.id === value)?.name
        : key === "expenseId"
          ? (() => {
              const r = records.find((r) => r.id === value);
              return r && "description" in r && "amount" in r
                ? `${r.description} · ${pkr(r.amount)}`
                : value;
            })()
          : value === "average"
            ? "Average · per cooked meal"
            : value === "divide_by_people"
              ? "Divide by selected people"
              : value;
  const showMembers =
    (kind === "fuel" && values.tier === "divide_by_people") ||
    (kind === "shared" && values.method !== "Excluded");
  async function submit(v: FormValues) {
    setError("");
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        ...v,
        id: editing?.id || crypto.randomUUID(),
        kind,
        memberIds: selected,
        manual: Object.fromEntries(
          selected.map((id) => [id, Math.round(Number(manual[id] || 0) * 100)]),
        ),
        oilRate: editing?.kind === "cooking" ? editing.oilRate : 0,
        gasRate: editing?.kind === "cooking" ? editing.gasRate : 0,
      };
      for (const key of moneyFields)
        data[key] = Math.round(Number(v[key] || 0) * 100);
      if (data.paidBy === "__legacy") delete data.paidBy;
      const entity = entitySchema.parse(data) as Entity;
      await onSave(entity);
      onClose();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(" ")}: ${i.message}`).join(". ")
          : e instanceof Error
            ? e.message
            : "Unable to save",
      );
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
          {editing ? "Edit" : "Add"} {kindLabels[kind].toLowerCase()}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-stone-500">
          {kind === "fuel"
            ? "Record the buyer here, then choose the resource in a meal."
            : kind === "purchase"
              ? "Credit the member who paid out of pocket."
              : "Your balances update automatically when you save."}
        </DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(submit)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <label
                key={f.key}
                className={`field ${f.type === "textarea" || f.key === "description" || f.key === "expenseId" ? "sm:col-span-2" : ""}`}
              >
                <span>
                  {f.label}
                  {f.required && <span className="text-emerald-700"> *</span>}
                </span>
                {f.options ? (
                  <select
                    {...form.register(f.key)}
                    aria-label={f.label}
                    required={f.required}
                    className="control"
                  >
                    {(f.key === "expenseId" || f.key === "memberId") && (
                      <option value="">Select…</option>
                    )}
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {labelFor(f.key, o)}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    {...form.register(f.key)}
                    className="control min-h-20"
                  />
                ) : (
                  <Input
                    {...form.register(f.key)}
                    type={f.type || "text"}
                    required={f.required}
                    min={f.type === "number" ? 0 : undefined}
                    step={f.type === "number" ? "0.01" : undefined}
                  />
                )}
                {f.help && <small>{f.help}</small>}
              </label>
            ))}
          </div>
          {kind === "cooking" && (
            <div className="space-y-4">
              {(["oil", "gas"] as const).map((resource) => {
                const key = `${resource}Id` as const;
                const available = byKind(records, "fuel").filter(
                  (f) =>
                    f.resource.toLowerCase() === resource &&
                    f.tier === "average" &&
                    ((!f.end && f.effective <= values.date) ||
                      f.id === initial[key]),
                );
                return (
                  <div
                    key={resource}
                    className="rounded-xl border border-stone-200 p-4"
                  >
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={!!values[key]}
                        onChange={(e) =>
                          form.setValue(
                            key,
                            e.target.checked ? available[0]?.id || "" : "",
                          )
                        }
                      />
                      {resource === "oil" ? "Oil" : "Gas"} used
                    </label>
                    <select className="control mt-3" {...form.register(key)}>
                      <option value="">Not used</option>
                      {available.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.resource} · {f.date} · {f.notes || pkr(f.amount)} ·{" "}
                          {pkr(
                            f[
                              values.meal.toLowerCase() as
                                | "breakfast"
                                | "lunch"
                                | "dinner"
                            ],
                          )}
                          /meal
                        </option>
                      ))}
                    </select>
                    {!available.length && (
                      <small className="mt-2 block text-stone-500">
                        Add an open average-tier {resource} purchase first.
                      </small>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-stone-500">
                One selected entry per resource. Rates are saved with this log
                and split only among actual eaters.
              </p>
            </div>
          )}
          {showMembers && (
            <div className="rounded-xl border border-stone-200 p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Users size={16} /> Participating members
                </span>
                <button
                  type="button"
                  className="text-xs text-emerald-700"
                  onClick={() =>
                    setSelected(
                      members
                        .filter((m) => m.status === "Active")
                        .map((m) => m.id),
                    )
                  }
                >
                  Select active
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg bg-stone-50 p-2"
                  >
                    <label className="flex flex-1 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, m.id]
                              : selected.filter((id) => id !== m.id),
                          )
                        }
                      />
                      {m.name}
                    </label>
                    {kind === "shared" &&
                      values.method === "Manual" &&
                      selected.includes(m.id) && (
                        <Input
                          aria-label={`${m.name} share in PKR`}
                          className="w-24"
                          type="number"
                          min="0"
                          step="0.01"
                          value={manual[m.id] || ""}
                          onChange={(e) =>
                            setManual({ ...manual, [m.id]: e.target.value })
                          }
                          placeholder="PKR"
                        />
                      )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-stone-500">
                {selected.length} selected
                {selected.length &&
                (kind === "fuel" || values.method === "Equal")
                  ? ` · about ${pkr(Math.round((Number(values.amount || 0) * 100) / selected.length))} each`
                  : ""}
                {values.method === "Manual"
                  ? ` · Allocated ${pkr(selected.reduce((n, id) => n + Math.round(Number(manual[id] || 0) * 100), 0))}`
                  : ""}
              </p>
            </div>
          )}
          {kind === "fuel" && values.tier === "average" && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              Charging continues until the end date, even when charges exceed
              the purchase amount. Existing meals retain their saved rates.
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {editing ? "Save changes" : "Save entry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
