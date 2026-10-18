"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  FileText,
  HandCoins,
  Phone,
  Scale,
  Utensils,
  Wallet,
  Receipt,
  Flame,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  byKind,
  meals,
  pkr,
  today,
  type Entity,
  type LedgerLine,
  type Meal,
} from "@/lib/domain";
import type { calculate } from "@/lib/settlement";
import { memberStays } from "@/lib/stays";
import { Button } from "./ui/button";
import { DataTable } from "./data-table";
import { SplitChart } from "./charts";

export type ProfileMember = ReturnType<typeof calculate>["settlements"][number];

const COLORS = {
  Food: "#16755a",
  Oil: "#c99b47",
  Gas: "#e0825c",
  Chai: "#8b6bb1",
  Shared: "#92a3be",
} as const;
const chargeCategories = ["Food", "Oil", "Gas", "Chai", "Shared"] as const;
type Charge = (typeof chargeCategories)[number];
const isCharge = (c: LedgerLine["category"]): c is Charge =>
  (chargeCategories as readonly string[]).includes(c);

/** Compact axis labels: 1,250 -> 1.3k. Values are paisa. */
const short = (paisa: number) => {
  const v = paisa / 100;
  return Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`
    : String(Math.round(v));
};
const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e5e8e2",
  fontSize: 12,
};
const axisTick = { fill: "#899188", fontSize: 11 };
const money = (paisa: number) => (paisa ? pkr(paisa) : "—");

type MealRow = {
  key: string;
  date: string;
  meal: Meal;
  Food: number;
  Oil: number;
  Gas: number;
  Chai: number;
  total: number;
};
type PaidRow = {
  id: string;
  date: string;
  group: string;
  description: string;
  amount: number;
};
type OtherRow = { id: string; date: string; category: string; description: string; amount: number };

function paidGroup(l: LedgerLine) {
  if (l.category === "Opening") return "Opening credit";
  if (l.category === "Payment")
    return l.description.startsWith("Paid cash to")
      ? "Cash given to members"
      : "Deposits";
  if (l.description.startsWith("Personal purchase")) return "Personal purchases";
  return "Bought for the mess";
}
const daysBetween = (from: string, to: string) =>
  Math.max(
    1,
    Math.round(
      (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 864e5,
    ) + 1,
  );

function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      <h3 className="section-title">{title}</h3>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-48 items-center justify-center text-center text-sm text-stone-400">
      {children}
    </p>
  );
}
function Kpi({
  icon,
  label,
  value,
  sub,
  tone = "stone",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "stone" | "green" | "amber";
}) {
  const tones = {
    stone: "bg-stone-100 text-stone-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="stat !p-4">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </span>
      <p className="mt-3 text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

export function MemberProfile({
  member,
  records,
  lines,
  writable,
  onBack,
  onSettle,
  onStatement,
}: {
  member: ProfileMember;
  records: Entity[];
  lines: LedgerLine[];
  writable: boolean;
  onBack: () => void;
  onSettle: () => void;
  onStatement: () => void;
}) {
  const [paidFilter, setPaidFilter] = useState("All");

  // Keep the latest callback without re-running the effect below.
  const backRef = useRef(onBack);
  useEffect(() => {
    backRef.current = onBack;
  });
  // Esc goes back, unless a dialog (e.g. Settle) is open on top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]'))
        backRef.current();
    };
    window.scrollTo({ top: 0 });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const data = useMemo(() => {
    const own = lines.filter((l) => l.memberId === member.id);
    const charged = { Food: 0, Oil: 0, Gas: 0, Chai: 0, Shared: 0 };
    own.forEach((l) => {
      if (isCharge(l.category)) charged[l.category] += l.debit;
    });
    const totalCharges = Object.values(charged).reduce((n, v) => n + v, 0);

    // Charges tied to a specific meal, one row per meal.
    const mealMap = new Map<string, MealRow>();
    own.forEach((l) => {
      if (!l.meal || !isCharge(l.category) || l.category === "Shared") return;
      const key = `${l.date}|${l.meal}`;
      const row = mealMap.get(key) ?? {
        key,
        date: l.date,
        meal: l.meal,
        Food: 0,
        Oil: 0,
        Gas: 0,
        Chai: 0,
        total: 0,
      };
      row[l.category] += l.debit;
      row.total += l.debit;
      mealMap.set(key, row);
    });
    const mealRows = [...mealMap.values()].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        meals.indexOf(b.meal) - meals.indexOf(a.meal),
    );
    const otherRows: OtherRow[] = own
      .filter((l) => isCharge(l.category) && !l.meal && l.debit > 0)
      .map((l) => ({
        id: l.id,
        date: l.date,
        category: l.category,
        description: l.description,
        amount: l.debit,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Everything this member paid or put in.
    const paidRows: PaidRow[] = own
      .filter((l) => l.credit > 0 && l.category !== "Settlement")
      .map((l) => ({
        id: l.id,
        date: l.date,
        group: paidGroup(l),
        description: l.description,
        amount: l.credit,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const paidGroups = new Map<string, number>();
    paidRows.forEach((r) =>
      paidGroups.set(r.group, (paidGroups.get(r.group) || 0) + r.amount),
    );
    const totalPaid = paidRows.reduce((n, r) => n + r.amount, 0);

    const sum = (f: (l: LedgerLine) => boolean, side: "debit" | "credit") =>
      own.filter(f).reduce((n, l) => n + l[side], 0);
    const returned = sum((l) => l.category === "Payment", "debit");
    const forgiven = sum((l) => l.category === "Settlement", "credit");
    const waived = sum((l) => l.category === "Settlement", "debit");

    // Running balance (one point per day) and month-by-month charges vs paid.
    const balanceByDay = new Map<string, number>();
    own.forEach((l) => balanceByDay.set(l.date, l.balance));
    const balanceSeries = [...balanceByDay].map(([date, balance]) => ({
      date,
      balance,
    }));
    const months = new Map<string, { month: string; charges: number; paid: number }>();
    own.forEach((l) => {
      const month = l.date.slice(0, 7);
      const m = months.get(month) ?? { month, charges: 0, paid: 0 };
      if (isCharge(l.category)) m.charges += l.debit;
      if (l.credit > 0 && l.category !== "Settlement") m.paid += l.credit;
      months.set(month, m);
    });
    const monthly = [...months.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    );

    const attended = byKind(records, "attendance").filter(
      (a) => a.memberId === member.id,
    );
    const byMeal = meals.map((meal) => {
      const rows = mealRows.filter((r) => r.meal === meal);
      return {
        meal,
        count: attended.filter((a) => a.meal === meal).length,
        spend: rows.reduce((n, r) => n + r.total, 0),
      };
    });
    const perMeal = [...mealRows]
      .slice(0, 28)
      .reverse()
      .map((r) => ({ ...r, label: `${r.date.slice(5)} ${r.meal[0]}` }));
    const mealCharge = mealRows.reduce((n, r) => n + r.total, 0);

    return {
      charged,
      totalCharges,
      mealRows,
      otherRows,
      paidRows,
      paidGroups,
      totalPaid,
      returned,
      forgiven,
      waived,
      balanceSeries,
      monthly,
      attendedCount: attended.length,
      byMeal,
      perMeal,
      avgMeal: mealRows.length ? Math.round(mealCharge / mealRows.length) : 0,
    };
  }, [lines, records, member.id]);

  const stays = memberStays(member);
  const now = today();
  const residentDays = stays.reduce(
    (n, s) => n + daysBetween(s.arrival, s.departure || now),
    0,
  );
  const balance = member.balance;
  const coverage = data.totalCharges
    ? Math.min(100, Math.round((data.totalPaid / data.totalCharges) * 100))
    : data.totalPaid
      ? 100
      : 0;
  const first = member.name.split(" ")[0];
  const initials = member.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  const donut = chargeCategories
    .map((name) => ({
      name,
      value: data.charged[name],
      color: COLORS[name],
    }))
    .filter((d) => d.value > 0);
  const maxMeals = Math.max(1, ...data.byMeal.map((m) => m.count));

  const mealColumns: ColumnDef<MealRow>[] = [
    { accessorKey: "date", header: "Date" },
    {
      accessorKey: "meal",
      header: "Meal",
      cell: ({ getValue }) => (
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {String(getValue())}
        </span>
      ),
    },
    ...(["Food", "Oil", "Gas", "Chai"] as const).map(
      (key): ColumnDef<MealRow> => ({
        accessorKey: key,
        header: key,
        cell: ({ getValue }) => (
          <span className="text-stone-600">{money(Number(getValue()))}</span>
        ),
      }),
    ),
    {
      accessorKey: "total",
      header: "Total charge",
      cell: ({ getValue }) => (
        <strong className="font-semibold">{pkr(Number(getValue()))}</strong>
      ),
    },
  ];
  const paidRows =
    paidFilter === "All"
      ? data.paidRows
      : data.paidRows.filter((r) => r.group === paidFilter);
  const paidColumns: ColumnDef<PaidRow>[] = [
    { accessorKey: "date", header: "Date" },
    {
      accessorKey: "group",
      header: "Type",
      cell: ({ getValue }) => (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
          {String(getValue())}
        </span>
      ),
    },
    { accessorKey: "description", header: "What it was for" },
    {
      accessorKey: "amount",
      header: "Amount paid",
      cell: ({ getValue }) => (
        <strong className="font-semibold text-emerald-800">
          {pkr(Number(getValue()))}
        </strong>
      ),
    },
  ];
  const otherColumns: ColumnDef<OtherRow>[] = [
    { accessorKey: "date", header: "Date" },
    { accessorKey: "category", header: "Category" },
    { accessorKey: "description", header: "Description" },
    {
      accessorKey: "amount",
      header: "Charge",
      cell: ({ getValue }) => pkr(Number(getValue())),
    },
  ];

  return (
    <div role="region" aria-label={`${member.name} profile`}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onStatement}>
              <FileText size={14} className="mr-1.5" /> Full statement
            </Button>
            {writable && balance !== 0 && (
              <Button size="sm" onClick={onSettle}>
                <ArrowLeftRight size={14} className="mr-1.5" /> Settle
              </Button>
            )}
          </div>
        </div>

        {/* Hero */}
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-xl font-semibold ring-1 ring-white/25`}
                aria-hidden
              >
                {initials}
              </span>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {member.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-50/80">
                  <span className="rounded-full bg-white/15 px-2.5 py-1 font-medium text-white">
                    {member.status}
                  </span>
                  {member.qaum && <span>{member.qaum}</span>}
                  {member.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} /> {member.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays size={12} /> Since{" "}
                    {member.arrival.slice(0, 10)} · {residentDays} days
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-emerald-100/70">
                {balance > 0
                  ? "Owes the mess"
                  : balance < 0
                    ? `Mess owes ${first}`
                    : "All settled"}
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {pkr(Math.abs(balance))}
              </p>
            </div>
          </div>
          <div className="mt-7">
            <div className="flex justify-between text-xs text-emerald-50/80">
              <span>Paid {pkr(data.totalPaid)}</span>
              <span>Charged {pkr(data.totalCharges)}</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"
              role="progressbar"
              aria-label="Share of charges already paid"
              aria-valuenow={coverage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-emerald-300"
                style={{ width: `${coverage}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-emerald-50/70">
              {coverage}% of charges covered by payments and credit
            </p>
          </div>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <Kpi
            icon={<Receipt size={17} />}
            label="Total charges"
            value={pkr(data.totalCharges)}
            sub="Food, fuel & shared"
            tone="amber"
          />
          <Kpi
            icon={<Wallet size={17} />}
            label="Total paid"
            value={pkr(data.totalPaid)}
            sub={`${data.paidRows.length} payments`}
            tone="green"
          />
          <Kpi
            icon={<Utensils size={17} />}
            label="Meals eaten"
            value={String(data.attendedCount)}
            sub={`${data.mealRows.length} charged meals`}
          />
          <Kpi
            icon={<Scale size={17} />}
            label="Average per meal"
            value={pkr(data.avgMeal)}
            sub="Food + oil, gas & chai"
          />
          <Kpi
            icon={<Flame size={17} />}
            label="Fuel charges"
            value={pkr(data.charged.Oil + data.charged.Gas + data.charged.Chai)}
            sub="Oil, gas & chai"
          />
          <Kpi
            icon={<HandCoins size={17} />}
            label="Forgiven / waived"
            value={pkr(data.forgiven + data.waived)}
            sub={
              data.returned
                ? `${pkr(data.returned)} refunded or received`
                : "Kept in settlement history"
            }
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel
            title="Balance over time"
            hint="Above zero the member owes the mess; below zero the mess owes them."
            className="lg:col-span-2"
          >
            {data.balanceSeries.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.balanceSeries}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="profileBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16755a" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#16755a" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#eceee9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(s) => String(s).slice(5)}
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tickFormatter={short}
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine y={0} stroke="#b7beb4" strokeDasharray="4 4" />
                    <Tooltip
                      formatter={(v) => pkr(Number(v))}
                      contentStyle={tooltipStyle}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="balance"
                      name="Balance"
                      stroke="#16755a"
                      strokeWidth={2.5}
                      fill="url(#profileBalance)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty>No ledger activity yet.</Empty>
            )}
          </Panel>
          <Panel title="Where the charges go">
            {donut.length ? (
              <SplitChart data={donut} />
            ) : (
              <Empty>No charges yet.</Empty>
            )}
          </Panel>
          <Panel title="Charged vs paid by month" className="lg:col-span-2">
            {data.monthly.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.monthly}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#eceee9" />
                    <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => pkr(Number(v))} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="charges" name="Charged" fill="#c99b47" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="paid" name="Paid" fill="#16755a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty>No monthly data yet.</Empty>
            )}
          </Panel>
          <Panel title="Meals by type">
            <div className="space-y-4">
              {data.byMeal.map((m) => (
                <div key={m.meal}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{m.meal}</span>
                    <span className="text-stone-500">
                      {m.count} meals · {pkr(m.spend)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${(m.count / maxMeals) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-stone-100 pt-4">
              <p className="text-xs font-medium text-stone-500">Stays</p>
              <ul className="mt-2 space-y-1.5 text-xs text-stone-500">
                {stays.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>
                      {s.arrival.slice(0, 10)} →{" "}
                      {s.departure ? s.departure.slice(0, 10) : "present"}
                    </span>
                    <span>{daysBetween(s.arrival, s.departure || now)} days</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
          <Panel
            title="Charge for each meal"
            hint={
              data.perMeal.length
                ? `Last ${data.perMeal.length} charged meals, oldest to newest.`
                : undefined
            }
            className="lg:col-span-3"
          >
            {data.perMeal.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.perMeal}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#eceee9" />
                    <XAxis dataKey="label" tick={{ ...axisTick, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
                    <YAxis tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => pkr(Number(v))} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {(["Food", "Oil", "Gas", "Chai"] as const).map((k, i, all) => (
                      <Bar
                        key={k}
                        dataKey={k}
                        stackId="meal"
                        fill={COLORS[k]}
                        radius={i === all.length - 1 ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty>No meal charges yet.</Empty>
            )}
          </Panel>
        </div>

        {/* Charges against each meal */}
        <Panel
          title="Charges against each meal"
          hint="What this member was charged for every meal they ate: food, plus oil, gas and chai."
        >
          <DataTable
            rows={data.mealRows}
            columns={mealColumns}
            filename={`${member.name}-meal-charges`}
            exportRows={data.mealRows.map((r) => ({
              Date: r.date,
              Meal: r.meal,
              "Food PKR": r.Food / 100,
              "Oil PKR": r.Oil / 100,
              "Gas PKR": r.Gas / 100,
              "Chai PKR": r.Chai / 100,
              "Total PKR": r.total / 100,
            }))}
          />
          {data.otherRows.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-medium">Other charges</h4>
              <p className="mb-3 mt-1 text-xs text-stone-400">
                Shared bills and direct fuel splits are not tied to a meal.
              </p>
              <DataTable
                rows={data.otherRows}
                columns={otherColumns}
                filename={`${member.name}-other-charges`}
              />
            </div>
          )}
        </Panel>

        {/* Paid amounts */}
        <Panel
          title="Amounts paid"
          hint="Deposits, items bought for the mess, personal purchases and cash handed to other members."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {["All", ...data.paidGroups.keys()].map((g) => {
              const active = paidFilter === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPaidFilter(g)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    active
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {g}
                  <span className="ml-1.5 text-stone-400">
                    {pkr(g === "All" ? data.totalPaid : data.paidGroups.get(g) || 0)}
                  </span>
                </button>
              );
            })}
          </div>
          <DataTable
            rows={paidRows}
            columns={paidColumns}
            filename={`${member.name}-payments`}
            exportRows={paidRows.map((r) => ({
              Date: r.date,
              Type: r.group,
              Description: r.description,
              "Amount PKR": r.amount / 100,
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
