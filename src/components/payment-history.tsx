"use client";
import { useState, type ReactNode } from "react";
import { byKind, pkr, type Entity } from "@/lib/domain";
import { DataTable } from "./data-table";
import { Button } from "./ui/button";
export function PaymentHistory({
  records,
  from,
  to,
  query,
  type,
  method,
  memberId,
  actions,
  onSource,
}: {
  records: Entity[];
  from: string;
  to: string;
  query: string;
  type: string;
  method: string;
  memberId: string;
  actions: (entity: Entity) => ReactNode;
  onSource: (entity: Entity) => void;
}) {
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const members = new Map(byKind(records, "member").map((m) => [m.id, m.name]));
  const entities = new Map(records.map((r) => [r.id, r]));
  const rows = records
    .filter((r) => r.kind === "payment" || r.kind === "purchase")
    .map((r) => {
      const source =
        r.kind === "payment" && r.sourceId
          ? entities.get(r.sourceId)
          : undefined;
      return {
        record: r,
        id: r.id,
        date: r.date,
        member: members.get(r.memberId) || "Unknown",
        memberId: r.memberId,
        type: r.kind === "purchase" ? "Personal purchase" : r.type,
        amount: r.amount,
        method: r.kind === "payment" ? r.method : "Other",
        source,
        sourceLabel:
          source?.kind === "food"
            ? "Meal purchases"
            : source?.kind === "fuel"
              ? "Oil / gas / chai"
              : source?.kind === "shared"
                ? "Shared expenses"
                : "Manual",
        description:
          r.kind === "purchase" ? r.description : r.notes || r.reference,
      };
    })
    .filter(
      (r) =>
        r.date >= from &&
        r.date <= to &&
        (type === "All" ||
          r.type ===
            (type === "Automatic purchase credit"
              ? "Purchase credit"
              : type)) &&
        (method === "All" || r.method === method) &&
        (memberId === "All" || r.memberId === memberId) &&
        (sourceFilter === "All sources" || sourceFilter === r.sourceLabel) &&
        `${r.member} ${r.type} ${r.description} ${r.sourceLabel}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-500">
        Purchase credits are saved here automatically. Edit the source meal or
        expense to change the buyer or amount; removing the source removes its
        credit too.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          aria-label="Payment source"
          className="control w-auto"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          {[
            "All sources",
            "Meal purchases",
            "Oil / gas / chai",
            "Shared expenses",
            "Manual",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-stone-500">
          {rows.length} payments / credits
        </span>
      </div>
      <DataTable
        rows={rows}
        columns={[
          { accessorKey: "date", header: "Date" },
          { accessorKey: "member", header: "Member" },
          { accessorKey: "type", header: "Type" },
          {
            accessorKey: "amount",
            header: "Amount",
            cell: ({ getValue }) => pkr(Number(getValue())),
          },
          { accessorKey: "sourceLabel", header: "Source" },
          {
            accessorKey: "description",
            header: "Description",
            cell: ({ getValue }) => (
              <span className="block max-w-72 whitespace-normal">
                {String(getValue())}
              </span>
            ),
          },
          {
            id: "actions",
            header: "",
            cell: ({ row }) =>
              row.original.source ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSource(row.original.source!)}
                >
                  View source
                </Button>
              ) : (
                actions(row.original.record)
              ),
          },
        ]}
        exportRows={rows.map((r) => ({
          Date: r.date,
          Member: r.member,
          Type: r.type,
          "Amount PKR": r.amount / 100,
          Source: r.sourceLabel,
          Description: r.description,
        }))}
        filename={`payments-${from}-${to}`}
      />
    </section>
  );
}
