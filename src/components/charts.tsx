"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { pkr } from "@/lib/domain";
export function SpendChart({
  data,
}: {
  data: { date: string; food: number; fuel: number; shared: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16755a" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#16755a" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="#eceee9"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(s) => s.slice(8)}
            tick={{ fill: "#899188", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(n) =>
              n >= 100000 ? `${(n / 100000).toFixed(0)}k` : String(n / 100)
            }
            tick={{ fill: "#899188", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => pkr(Number(value))}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e8e2",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="food"
            name="Food"
            stroke="#16755a"
            strokeWidth={2.5}
            fill="url(#spendFill)"
          />
          <Area
            type="monotone"
            dataKey="fuel"
            name="Cooking fuel"
            stroke="#c99b47"
            strokeWidth={2}
            fill="transparent"
          />
          <Area
            type="monotone"
            dataKey="shared"
            name="Shared expenses"
            stroke="#92a3be"
            strokeWidth={2}
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SplitChart({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div>
      <div className="relative mx-auto h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={
                total
                  ? data
                  : [{ name: "No expenses", value: 1, color: "#e7e9e4" }]
              }
              dataKey="value"
              innerRadius={59}
              outerRadius={77}
              stroke="white"
              strokeWidth={5}
            >
              {(total ? data : [{ color: "#e7e9e4" }]).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => pkr(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-stone-400">Total expense</span>
          <strong className="mt-1 text-lg">
            {(total / 100).toLocaleString("en-PK", {
              maximumFractionDigits: 0,
            })}
          </strong>
          <span className="text-[10px] text-stone-400">PKR</span>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {data.map((d) => (
          <div
            key={d.name}
            className="flex items-center justify-between text-xs"
          >
            <span className="flex items-center gap-2 text-stone-500">
              <i
                className="h-2 w-2 rounded-full"
                style={{ background: d.color }}
              />
              {d.name}
            </span>
            <strong className="font-medium">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
