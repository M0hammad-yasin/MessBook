"use client";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Plus, Trash2, Users, Loader2, Utensils } from "lucide-react";
import {
  byKind,
  meals,
  pkr,
  today,
  type Entity,
  type Meal,
} from "@/lib/domain";
import { readMeal, type MealInput } from "@/lib/meal-service";
import { prepareEntity, type RateOverrides } from "@/lib/validation";
import { calculate } from "@/lib/settlement";
import { canJoinMeal } from "@/lib/stays";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const resources = ["oil", "gas", "chai"] as const;
// Manual charges are edited in PKR as text; "" means "use the average rate".
type Values = Omit<MealInput, "items" | "oilRate" | "gasRate" | "chaiRate"> & {
  oilRate: string;
  gasRate: string;
  chaiRate: string;
  items: {
    id: string;
    description: string;
    amount: string;
    paidBy: string;
    paidAt?: string;
  }[];
};
const newItem = (paidBy = "") => ({
  id: crypto.randomUUID(),
  description: "",
  amount: "",
  paidBy,
});
function initial(records: Entity[], date: string, meal: Meal): Values {
  const saved = readMeal(records, date, meal);
  const rate = (n?: number) => (n === undefined ? "" : String(n / 100));
  return {
    ...saved,
    oilRate: rate(saved.oilRate),
    gasRate: rate(saved.gasRate),
    chaiRate: rate(saved.chaiRate),
    items: saved.items.length
      ? saved.items.map((r) => ({ ...r, amount: String(r.amount / 100) }))
      : [newItem()],
  };
}

export function MealForm({
  records,
  date = today(),
  meal = "Breakfast",
  onClose,
  onSave,
}: {
  records: Entity[];
  date?: string;
  meal?: Meal;
  onClose: () => void;
  onSave: (meal: MealInput) => Promise<void>;
}) {
  const form = useForm<Values>({ defaultValues: initial(records, date, meal) });
  const rows = useFieldArray({
    control: form.control,
    name: "items",
    keyName: "fieldKey",
  });
  const v = form.watch();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const members = byKind(records, "member");
  const saved = readMeal(records, v.date, v.meal);
  const historic = saved.memberIds.filter(
    (id) => members.find((m) => m.id === id)?.status !== "Active",
  );
  const eligible = members.filter((m) => canJoinMeal(m, v.date));
  const fuel = byKind(records, "fuel");
  const oldLog = records.find(
    (r) => r.kind === "cooking" && r.date === v.date && r.meal === v.meal,
  );
  let rates = { oil: 0, gas: 0, chai: 0 };
  let rateError = "";
  const overrides: RateOverrides = {};
  for (const r of resources) {
    const raw = v[`${r}Rate`];
    if (v[`${r}Id`] && raw !== undefined && raw.trim() !== "")
      overrides[r] = Math.round(Number(raw) * 100);
  }
  // How much of each purchase is still unallocated, ignoring this meal's saved charge.
  const charged = useMemo(() => calculate(records).fuelCharged, [records]);
  const averageFor = (id: string) => {
    const f = fuel.find((x) => x.id === id);
    return f ? f[v.meal.toLowerCase() as "breakfast" | "lunch" | "dinner"] : 0;
  };
  const remainingFor = (id: string) => {
    const f = fuel.find((x) => x.id === id);
    if (!f) return 0;
    const own =
      oldLog?.kind === "cooking"
        ? (["oil", "gas", "chai"] as const).reduce(
            (n, r) => (oldLog[`${r}Id`] === id ? n + (oldLog[`${r}Rate`] || 0) : n),
            0,
          )
        : 0;
    return f.amount - ((charged[id] || 0) - own);
  };
  try {
    const log = prepareEntity(
      {
        id: oldLog?.id || "meal-preview",
        kind: "cooking",
        date: v.date,
        meal: v.meal,
        oilId: v.oilId,
        gasId: v.gasId,
        chaiId: v.chaiId,
        oilRate: 0,
        gasRate: 0,
        chaiRate: 0,
      },
      records,
      overrides,
    );
    if (log.kind === "cooking")
      rates = { oil: log.oilRate, gas: log.gasRate, chai: log.chaiRate || 0 };
  } catch (e) {
    rateError = e instanceof Error ? e.message : "Check selected resources";
  }
  const foodTotal = v.items.reduce(
    (n, r) => n + Math.round((Number(r.amount) || 0) * 100),
    0,
  );
  const total = foodTotal + rates.oil + rates.gas + rates.chai;
  const buyers = members.filter(
    (m) => m.status === "Active" || v.items.some((r) => r.paidBy === m.id),
  );
  function selectSlot(nextDate: string, nextMeal: Meal) {
    form.reset(initial(records, nextDate, nextMeal));
    setError("");
    setRemoveConfirm(false);
  }
  async function submit(values: Values, remove = false) {
    setSaving(true);
    setError("");
    try {
      const manual = (id: string, raw: string) =>
        id && raw.trim() !== "" ? Math.round(Number(raw) * 100) : undefined;
      await onSave({
        ...values,
        oilRate: manual(values.oilId, values.oilRate),
        gasRate: manual(values.gasId, values.gasRate),
        chaiRate: manual(values.chaiId, values.chaiRate),
        remove,
        items: remove
          ? []
          : values.items.map((r) => ({
              ...r,
              amount: Math.round(Number(r.amount) * 100),
            })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save meal");
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
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle className="flex items-center gap-2 pr-8 text-xl font-semibold">
          <Utensils size={21} />
          {v.original ? "Edit meal" : "Add meal"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-stone-500">
          Items, who paid, and who ate — saved together.
        </DialogDescription>
        <form
          className="mt-5 space-y-5"
          onSubmit={form.handleSubmit((values) => submit(values))}
        >
          <fieldset disabled={saving} className="space-y-5 min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Date</span>
                <Input
                  aria-label="Meal date"
                  type="date"
                  required
                  value={v.date}
                  onChange={(e) => selectSlot(e.target.value, v.meal)}
                />
              </label>
              <label className="field">
                <span>Meal</span>
                <select
                  aria-label="Meal type"
                  className="control"
                  value={v.meal}
                  onChange={(e) => selectSlot(v.date, e.target.value as Meal)}
                >
                  {meals.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
            {v.original && (
              <div
                role="status"
                className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
              >
                This {v.meal.toLowerCase()} already exists. Its saved items and
                eaters are loaded below. Saving updates this meal.
              </div>
            )}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  Items / ingredients / food
                </h3>
                <span className="text-sm text-stone-500">
                  {v.items.length} {v.items.length === 1 ? "item" : "items"}
                </span>
              </div>
              {rows.fields.map((row, i) => (
                <div
                  key={row.fieldKey}
                  className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:grid-cols-[1.4fr_.8fr_1fr_auto]"
                >
                  <label className="field col-span-2 sm:col-span-1">
                    <span>Item {i + 1}</span>
                    <Input
                      placeholder="e.g. Tomatoes, roti, eggs"
                      {...form.register(`items.${i}.description`)}
                      required
                      maxLength={300}
                    />
                  </label>
                  <label className="field">
                    <span>Price (PKR)</span>
                    <Input
                      aria-label={`Item ${i + 1} price`}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="10000000"
                      step="0.01"
                      required
                      {...form.register(`items.${i}.amount`)}
                    />
                  </label>
                  <label className="field">
                    <span>Paid by</span>
                    <select
                      aria-label={`Item ${i + 1} paid by`}
                      className="control"
                      {...form.register(`items.${i}.paidBy`)}
                    >
                      <option value="">Mess fund</option>
                      {buyers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {m.status !== "Active" ? " (inactive)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-self-end self-end col-span-2 sm:col-span-1"
                    aria-label={`Remove item ${i + 1}`}
                    onClick={() => rows.remove(i)}
                  >
                    <Trash2 size={17} />
                    <span className="sm:hidden">Remove item</span>
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  rows.append(newItem(v.items.at(-1)?.paidBy), {
                    focusName: `items.${v.items.length}.description`,
                  })
                }
              >
                <Plus size={16} />
                Add another item
              </Button>
            </section>
            <section className="rounded-xl border border-stone-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={17} />
                  Who is eating?{" "}
                  <span className="text-emerald-700">
                    {v.memberIds.length} selected
                  </span>
                </h3>
                <div className="flex gap-3 text-xs text-emerald-700">
                  <button
                    type="button"
                    onClick={() =>
                      form.setValue("memberIds", [
                        ...new Set([
                          ...eligible.map((m) => m.id),
                          ...v.memberIds.filter((id) => historic.includes(id)),
                        ]),
                      ])
                    }
                  >
                    Select all active
                  </button>
                  <button
                    type="button"
                    onClick={() => form.setValue("memberIds", [])}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {eligible.map((m) => (
                  <label
                    key={m.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${v.memberIds.includes(m.id) ? "border-emerald-200 bg-emerald-50" : "border-stone-100"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-700"
                      checked={v.memberIds.includes(m.id)}
                      onChange={(e) =>
                        form.setValue(
                          "memberIds",
                          e.target.checked
                            ? [...v.memberIds, m.id]
                            : v.memberIds.filter((id) => id !== m.id),
                        )
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>
              {!eligible.length && (
                <p className="text-sm text-stone-500">
                  No active members have a stay covering this date.
                </p>
              )}
              {!!historic.length && (
                <details className="mt-3 text-xs text-stone-500">
                  <summary>
                    Historical inactive eaters ({historic.length})
                  </summary>
                  <p className="my-2">
                    Retained from this saved meal. Uncheck only to correct
                    historical attendance.
                  </p>
                  {historic.map((id) => (
                    <label
                      className="flex min-h-10 items-center gap-2"
                      key={id}
                    >
                      <input
                        type="checkbox"
                        checked={v.memberIds.includes(id)}
                        onChange={(e) =>
                          form.setValue(
                            "memberIds",
                            e.target.checked
                              ? [...v.memberIds, id]
                              : v.memberIds.filter((x) => x !== id),
                          )
                        }
                      />
                      {members.find((m) => m.id === id)?.name}
                    </label>
                  ))}
                </details>
              )}
            </section>
            <details
              className="rounded-xl border border-stone-200 p-4"
              open={!!(v.oilId || v.gasId || v.chaiId)}
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Oil, gas & chai{" "}
                <span className="font-normal text-stone-500">
                  · {pkr(rates.oil + rates.gas + rates.chai)}
                </span>
              </summary>
              <p className="mt-2 text-xs text-stone-500">
                Choose the purchase each resource is taken from. The average
                rate is suggested; type this meal&apos;s actual charge to
                override it. The charge is deducted from the chosen purchase.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {resources.map((resource) => {
                  const label = resource[0].toUpperCase() + resource.slice(1);
                  const idKey = `${resource}Id` as const;
                  const rateKey = `${resource}Rate` as const;
                  const select = form.register(idKey);
                  const picked = v[idKey];
                  const effective = rates[resource];
                  const remaining = picked ? remainingFor(picked) : 0;
                  return (
                    <div key={resource} className="space-y-2">
                      <label className="field">
                        <span>{label}</span>
                        <select
                          aria-label={`${label} entry`}
                          className="control"
                          {...select}
                          onChange={(e) => {
                            select.onChange(e);
                            // A different purchase starts again from its own average.
                            form.setValue(rateKey, "");
                          }}
                        >
                          <option value="">Not used</option>
                          {fuel
                            .filter(
                              (f) =>
                                f.resource.toLowerCase() === resource &&
                                f.tier === "average" &&
                                ((!f.end && f.effective <= v.date) ||
                                  f.id === saved[idKey]),
                            )
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.date} · {pkr(f.amount)} · left{" "}
                                {pkr(remainingFor(f.id))}
                                {f.notes ? ` · ${f.notes}` : ""}
                              </option>
                            ))}
                        </select>
                      </label>
                      {picked && (
                        <label className="field">
                          <span>{label} charge for this meal (PKR)</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`${label} charge`}
                            placeholder={String(averageFor(picked) / 100)}
                            {...form.register(rateKey)}
                          />
                          <small>
                            Average {pkr(averageFor(picked))}. Leave blank to
                            use it.
                          </small>
                          {effective > remaining && (
                            <small className="text-amber-700">
                              Exceeds the {pkr(Math.max(remaining, 0))} left on
                              this purchase; it will show as overcharged.
                            </small>
                          )}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {rateError && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  {rateError}
                </p>
              )}
            </details>
            <div
              className="rounded-xl bg-emerald-950 p-4 text-white"
              aria-live="polite"
            >
              <div className="flex justify-between text-xs text-emerald-200">
                <span>Ingredients {pkr(foodTotal)}</span>
                <span>
                  Oil / gas / chai {pkr(rates.oil + rates.gas + rates.chai)}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-emerald-200">Meal total</p>
                  <strong className="text-2xl">{pkr(total)}</strong>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-200">
                    {v.memberIds.length} eaters · average each
                  </p>
                  <strong className="text-lg">
                    {v.memberIds.length
                      ? pkr(total / v.memberIds.length)
                      : "Select eaters"}
                  </strong>
                </div>
              </div>
              <p className="mt-3 text-xs text-emerald-200">
                Each buyer receives credit for their items. Balances update once
                when you save.
              </p>
            </div>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-stone-100 bg-white pt-4">
            {v.original && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto min-h-11 px-2 text-red-700"
                disabled={saving}
                onClick={() => setRemoveConfirm(!removeConfirm)}
              >
                Archive
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="min-h-11"
              disabled={saving || !!rateError}
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {v.original ? "Save changes" : "Save meal"}
            </Button>
          </div>
          {removeConfirm && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <p>
                Archive this meal, its attendance, and its buyer credits? This
                removes its charges from member balances and retains the audit
                history.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={saving}
                onClick={() => submit(v, true)}
              >
                Confirm archive
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
