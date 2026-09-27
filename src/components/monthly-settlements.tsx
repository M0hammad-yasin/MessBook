"use client";
import { calculate } from "@/lib/settlement";
import { pkr, type Entity } from "@/lib/domain";
import { DataTable } from "./data-table";
export function MonthlySettlements({
  records,
  from,
  to,
  query,
}: {
  records: Entity[];
  from: string;
  to: string;
  query: string;
}) {
  const months = [
    ...new Set(
      records
        .filter((r) => "date" in r && r.date >= from && r.date <= to)
        .map((r) => ("date" in r ? r.date.slice(0, 7) : "")),
    ),
  ].sort();
  const rows = months.flatMap((month) => {
    const [year, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
    const through = end < to ? end : to;
    return calculate(records, through)
      .settlements.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()),
      )
      .map((s) => ({
        month,
        through,
        member: s.name,
        charges: s.food + s.fuel + s.shared,
        credit: s.credit,
        netDue: s.balance,
      }));
  });
  return (
    <section>
      <h2 className="section-title mb-2">Resident settlement snapshots</h2>
      <p className="mb-4 text-xs text-stone-400">
        Cumulative through each month-end, capped at your selected end date.
      </p>
      <DataTable
        rows={rows}
        columns={[
          { accessorKey: "month", header: "Month" },
          { accessorKey: "through", header: "As of" },
          { accessorKey: "member", header: "Member" },
          {
            accessorKey: "charges",
            header: "Total charges",
            cell: ({ getValue }) => pkr(Number(getValue())),
          },
          {
            accessorKey: "credit",
            header: "Net credit",
            cell: ({ getValue }) => pkr(Number(getValue())),
          },
          {
            accessorKey: "netDue",
            header: "Net due",
            cell: ({ getValue }) => (
              <span
                className={Number(getValue()) < 0 ? "text-emerald-700" : ""}
              >
                {pkr(Number(getValue()))}
              </span>
            ),
          },
        ]}
        exportRows={rows.map((r) => ({
          Month: r.month,
          "As of": r.through,
          Member: r.member,
          "Charges PKR": r.charges / 100,
          "Credit PKR": r.credit / 100,
          "Net due PKR": r.netDue / 100,
        }))}
        filename={`monthly-settlements-${from}-${to}`}
      />
    </section>
  );
}
