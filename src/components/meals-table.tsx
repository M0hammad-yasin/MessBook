"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { calculate } from "@/lib/settlement";
import { readMeal } from "@/lib/meal-service";
import { byKind, meals, pkr, type Entity, type Meal } from "@/lib/domain";
import { DataTable } from "./data-table";
import { Button } from "./ui/button";

export function MealsTable({
  records,
  from,
  to,
  query,
  filter,
  memberFilter,
  onEdit,
}: {
  records: Entity[];
  from: string;
  to: string;
  query: string;
  filter: string;
  memberFilter: string;
  onEdit: (date: string, meal: Meal) => void;
}) {
  const [memberRole, setMemberRole] = useState("Eater or buyer");
  const [resource, setResource] = useState("All resources");
  const [status, setStatus] = useState("All meals");
  const members = byKind(records, "member");
  const name = (id: string) =>
    members.find((m) => m.id === id)?.name || "Mess fund";
  const rows = calculate(records)
    .mealSummaries.map((summary) => {
      const detail = readMeal(records, summary.date, summary.meal);
      return {
        ...summary,
        items: detail.items,
        memberIds: detail.memberIds,
        descriptions: detail.items.map((i) => i.description).join(", "),
        buyers: [...new Set(detail.items.map((i) => name(i.paidBy)))].join(
          ", ",
        ),
      };
    })
    .filter(
      (r) =>
        r.date >= from &&
        r.date <= to &&
        (filter === "All" || r.meal === filter) &&
        `${r.date} ${r.meal} ${r.descriptions} ${r.buyers} ${r.memberIds.map(name).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (memberFilter === "All" ||
          (memberRole !== "Buyer" && r.memberIds.includes(memberFilter)) ||
          (memberRole !== "Eater" &&
            r.items.some((i) => i.paidBy === memberFilter))) &&
        (resource === "All resources" ||
          (resource === "Oil"
            ? !!r.oilId
            : resource === "Gas"
              ? !!r.gasId
              : !!r.chaiId)) &&
        (status === "All meals" ||
          (status === "Missing attendance"
            ? !r.eaters
            : status === "Member-funded"
              ? r.items.some((i) => i.paidBy)
              : r.items.every((i) => !i.paidBy))),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        meals.indexOf(a.meal) - meals.indexOf(b.meal),
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Member role"
          className="control w-auto"
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value)}
        >
          {["Eater or buyer", "Eater", "Buyer"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          aria-label="Meal resource filter"
          className="control w-auto"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          {["All resources", "Oil", "Gas", "Chai"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select
          aria-label="Meal status filter"
          className="control w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "All meals",
            "Missing attendance",
            "Member-funded",
            "Mess fund only",
          ].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        {(memberRole !== "Eater or buyer" ||
          resource !== "All resources" ||
          status !== "All meals") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMemberRole("Eater or buyer");
              setResource("All resources");
              setStatus("All meals");
            }}
          >
            Reset meal filters
          </Button>
        )}
        <span className="ml-auto text-sm text-stone-500">
          {rows.length} meals · {pkr(rows.reduce((n, r) => n + r.total, 0))}
        </span>
      </div>
      <DataTable
        rows={rows}
        columns={[
          { accessorKey: "date", header: "Date" },
          {
            accessorKey: "meal",
            header: "Meal",
            cell: ({ row }) => (
              <button
                className="text-left font-semibold text-emerald-800"
                onClick={() => onEdit(row.original.date, row.original.meal)}
              >
                {row.original.meal}
                <span className="block text-xs font-normal text-stone-400">
                  {row.original.items.length}{" "}
                  {row.original.items.length === 1 ? "item" : "items"}
                </span>
              </button>
            ),
          },
          {
            accessorKey: "descriptions",
            header: "Items",
            cell: ({ getValue }) => (
              <span className="block max-w-72 whitespace-normal">
                {String(getValue()) || "No ingredients"}
              </span>
            ),
          },
          { accessorKey: "buyers", header: "Paid by" },
          {
            accessorKey: "eaters",
            header: "Eaters",
            cell: ({ getValue }) =>
              getValue() || (
                <span className="text-amber-700">Needs attendance</span>
              ),
          },
          {
            accessorKey: "total",
            header: "Total",
            cell: ({ getValue }) => pkr(Number(getValue())),
          },
          {
            accessorKey: "perEater",
            header: "Average / eater",
            cell: ({ row }) =>
              row.original.eaters ? pkr(row.original.perEater) : "—",
          },
          {
            id: "edit",
            header: "",
            cell: ({ row }) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Edit ${row.original.date} ${row.original.meal}`}
                onClick={() => onEdit(row.original.date, row.original.meal)}
              >
                <Pencil size={15} />
                Edit
              </Button>
            ),
          },
        ]}
        filename={`meals-${from}-${to}`}
        exportRows={rows.map((r) => ({
          Date: r.date,
          Meal: r.meal,
          Items: r.descriptions,
          "Paid by": r.buyers,
          Eaters: r.memberIds.map(name).join("; "),
          "Food PKR": r.food / 100,
          "Oil PKR": r.oil / 100,
          "Gas PKR": r.gas / 100,
          "Chai PKR": r.chai / 100,
          "Total PKR": r.total / 100,
          "Average per eater PKR": r.perEater / 100,
          "Item details": r.items
            .map(
              (i) => `${i.description}: ${pkr(i.amount)} (${name(i.paidBy)})`,
            )
            .join("; "),
        }))}
      />
    </div>
  );
}
