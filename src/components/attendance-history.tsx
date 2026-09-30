"use client";
import { useMemo, useState } from "react";
import { byKind, meals, today, type Entity, type Meal } from "@/lib/domain";
import { isKnownResidentOn } from "@/lib/stays";
import { DataTable } from "./data-table";
export function AttendanceHistory({
  records,
  from,
  to,
  query,
  mealFilter,
  memberFilter,
}: {
  records: Entity[];
  from: string;
  to: string;
  query: string;
  mealFilter: string;
  memberFilter: string;
}) {
  const [status, setStatus] = useState("All attendance");
  const rows = useMemo(() => {
    const members = byKind(records, "member"),
      names = new Map(members.map((m) => [m.id, m.name]));
    const slots = new Map<
      string,
      { date: string; meal: Meal; ids: Set<string>; items: string[] }
    >();
    for (const r of records) {
      if (r.kind !== "food" && r.kind !== "cooking" && r.kind !== "attendance")
        continue;
      if (
        r.date < from ||
        r.date > to ||
        r.date > today() ||
        (mealFilter !== "All" && r.meal !== mealFilter)
      )
        continue;
      const key = `${r.date}|${r.meal}`,
        slot = slots.get(key) || {
          date: r.date,
          meal: r.meal,
          ids: new Set<string>(),
          items: [],
        };
      if (r.kind === "attendance") slot.ids.add(r.memberId);
      if (r.kind === "food") slot.items.push(r.description);
      slots.set(key, slot);
    }
    return [...slots.values()]
      .map((s) => ({
        ...s,
        ate: [...s.ids].map((id) => names.get(id) || "Unknown").join(", "),
        notMarked: members
          .filter((m) => isKnownResidentOn(m, s.date) && !s.ids.has(m.id))
          .map((m) => m.name)
          .join(", "),
        count: s.ids.size,
      }))
      .filter(
        (s) =>
          `${s.date} ${s.meal} ${s.items.join(" ")} ${s.ate} ${s.notMarked}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (memberFilter === "All" ||
            (status === "Not marked"
              ? !s.ids.has(memberFilter) &&
                members.some(
                  (m) => m.id === memberFilter && isKnownResidentOn(m, s.date),
                )
              : status === "Ate"
                ? s.ids.has(memberFilter)
                : s.ids.has(memberFilter) ||
                  members.some(
                    (m) => m.id === memberFilter && isKnownResidentOn(m, s.date),
                  ))),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          meals.indexOf(b.meal) - meals.indexOf(a.meal),
      );
  }, [records, from, to, query, mealFilter, memberFilter, status]);
  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-500">
        Meal attendance from today backwards. “Not marked” means no eater entry;
        it does not mean the person was absent from the house.
      </p>
      <select
        className="control w-auto"
        aria-label="Attendance status"
        value={status}
        disabled={memberFilter === "All"}
        onChange={(e) => setStatus(e.target.value)}
      >
        {["All attendance", "Ate", "Not marked"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <DataTable
        rows={rows}
        columns={[
          { accessorKey: "date", header: "Date" },
          { accessorKey: "meal", header: "Meal" },
          { accessorKey: "count", header: "Eaters" },
          {
            accessorKey: "ate",
            header: "Who ate",
            cell: ({ getValue }) => (
              <span className="block max-w-80 whitespace-normal">
                {String(getValue()) || "No eaters recorded"}
              </span>
            ),
          },
          {
            accessorKey: "notMarked",
            header: "Residents not marked",
            cell: ({ getValue }) => (
              <span className="block max-w-80 whitespace-normal text-stone-500">
                {String(getValue()) || "—"}
              </span>
            ),
          },
        ]}
        exportRows={rows.map((r) => ({
          Date: r.date,
          Meal: r.meal,
          Eaters: r.count,
          "Who ate": r.ate,
          "Not marked": r.notMarked,
          Items: r.items.join(", "),
        }))}
        filename={`attendance-${from}-${to}`}
      />
    </section>
  );
}
