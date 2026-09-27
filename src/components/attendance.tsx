"use client";
import { useState } from "react";
import { Check, Save, Users, Loader2 } from "lucide-react";
import { byKind, meals, type Entity, type Meal } from "@/lib/domain";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AttendanceBoard({
  records,
  date,
  save,
  addCooking,
}: {
  records: Entity[];
  date: string;
  save: (upsert: Entity[], archive: string[]) => Promise<void>;
  addCooking: () => void;
}) {
  const existing = byKind(records, "attendance").filter((a) => a.date === date);
  const initial = existing.map((a) => `${a.memberId}|${a.meal}`);
  const [selected, setSelected] = useState(new Set(initial));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const members = byKind(records, "member").filter(
    (m) =>
      (m.status === "Active" || existing.some((a) => a.memberId === m.id)) &&
      m.arrival.slice(0, 10) <= date &&
      (!m.departure || m.departure.slice(0, 10) >= date),
  );
  const visible = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );
  const toggle = (id: string, meal: Meal) => {
    setSaved(false);
    const next = new Set(selected);
    const key = `${id}|${meal}`;
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };
  const dirty =
    selected.size !== initial.length ||
    initial.some((key) => !selected.has(key));
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const additions: Entity[] = [...selected]
        .filter((key) => !initial.includes(key))
        .map((key) => {
          const [memberId, meal] = key.split("|");
          return {
            id: crypto.randomUUID(),
            kind: "attendance",
            date,
            memberId,
            meal: meal as Meal,
          };
        });
      const removals = existing
        .filter((a) => !selected.has(`${a.memberId}|${a.meal}`))
        .map((a) => a.id);
      await save(additions, removals);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {meals.map((meal) => (
          <div className="panel p-4 sm:p-5" key={meal}>
            <p className="text-xs text-stone-500">{meal}</p>
            <p className="mt-2 text-3xl font-semibold">
              {members.filter((m) => selected.has(`${m.id}|${meal}`)).length}
              <span className="ml-2 text-sm font-normal text-stone-400">
                eaters
              </span>
            </p>
          </div>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
          <div>
            <h3 className="font-semibold">Who joined the table?</h3>
            <p className="mt-1 text-xs text-stone-500">
              Tap a meal to mark attendance for {date}.
            </p>
          </div>
          <Input
            className="w-full sm:w-56"
            placeholder="Find a member…"
            aria-label="Find member for attendance"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="attendance-grid bg-stone-50 px-4 py-3 text-xs text-stone-500">
          <span>MEMBER</span>
          {meals.map((meal) => (
            <button
              key={meal}
              title={`Mark all visible members for ${meal}`}
              onClick={() => {
                const next = new Set(selected);
                const all = visible.every((m) => next.has(`${m.id}|${meal}`));
                visible.forEach((m) =>
                  all
                    ? next.delete(`${m.id}|${meal}`)
                    : next.add(`${m.id}|${meal}`),
                );
                setSelected(next);
                setSaved(false);
              }}
            >
              {meal}
              <span className="hidden sm:inline"> · select all</span>
            </button>
          ))}
        </div>
        {visible.map((m, i) => (
          <div
            key={m.id}
            className="attendance-grid border-t border-stone-100 px-4 py-4"
          >
            <div className="flex items-center gap-3">
              <span className={`avatar tone-${i % 4} hidden sm:flex`}>
                {m.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="text-sm font-medium">{m.name}</span>
            </div>
            {meals.map((meal) => (
              <button
                key={meal}
                aria-label={`${m.name}, ${meal}`}
                aria-pressed={selected.has(`${m.id}|${meal}`)}
                onClick={() => toggle(m.id, meal)}
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl border transition ${selected.has(`${m.id}|${meal}`) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-300"}`}
              >
                <Check size={19} />
              </button>
            ))}
          </div>
        ))}
        {!visible.length && (
          <div className="empty">
            <Users />
            <p>No eligible members for this date.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 p-5">
          <span className="text-xs text-stone-500">
            {saved
              ? "Attendance saved."
              : dirty
                ? "You have unsaved changes."
                : "Only marked members share meal costs."}
          </span>
          <Button disabled={busy || !dirty} onClick={submit}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save attendance
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div>
          <h3 className="font-medium text-emerald-950">
            Used oil or gas today?
          </h3>
          <p className="mt-1 text-sm text-emerald-800">
            Choose the purchase used for each cooked meal.
          </p>
        </div>
        <Button variant="outline" onClick={addCooking}>
          Add cooking log
        </Button>
      </div>
    </div>
  );
}
