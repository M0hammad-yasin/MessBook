"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { can, type SessionUser } from "@/lib/permissions";
import { prepareRecordMutation } from "@/lib/record-service";
import { migrateRecords } from "@/lib/migrations";
import { memberStays } from "@/lib/stays";
import { AccessProvider, Can } from "./access-context";
import { AuthScreen } from "./auth-screen";
import { UsersPage } from "./users-page";
import { AttendanceBoard } from "./attendance";
import { AttendanceHistory } from "./attendance-history";
import { PaymentHistory } from "./payment-history";
import { RecordDetails } from "./record-details";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Utensils,
  Flame,
  Receipt,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  History,
  Plus,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  Menu,
  X,
  LogOut,
  Leaf,
  Check,
  AlertTriangle,
  Pencil,
  Archive,
  RefreshCw,
  BookOpen,
  Coffee,
  Sun,
  Moon,
  Loader2,
  ArrowRight,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  byKind,
  meals,
  pkr,
  today,
  type Entity,
  type Kind,
  type Member,
  type State,
} from "@/lib/domain";
import { calculate } from "@/lib/settlement";
import { demoRecords } from "@/lib/demo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { EntryForm, kindLabels } from "./entry-form";
import { MealForm } from "./meal-form";
import { MealsTable } from "./meals-table";
import { type MealInput } from "@/lib/meal-service";
import { DataTable, exportCsv } from "./data-table";
import { SpendChart, SplitChart } from "./charts";
import { MonthlySettlements } from "./monthly-settlements";
import {
  getAuth,
  logout,
  getRecords,
  saveRecords,
  getAudit,
  ApiError,
  AuditEntry,
} from "@/lib/api";

const navigation = [
  { id: "overview", label: "Home", icon: LayoutDashboard },
  { id: "members", label: "Members", icon: Users },
  { id: "food", label: "Meals", icon: Utensils },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "users", label: "Users", icon: Users },
  { id: "fuel", label: "Oil, gas & chai", icon: Flame },
  { id: "shared", label: "Shared expenses", icon: Receipt },
  { id: "payments", label: "Payments & credit", icon: Wallet },
  { id: "settlements", label: "Settlements", icon: ArrowLeftRight },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "audit", label: "Activity log", icon: History },
] as const;
type Page = (typeof navigation)[number]["id"];
const monthStart = () => today().slice(0, 7) + "-01";
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar tone-${index % 4}`}>
      {name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
function Balance({ value }: { value: number }) {
  return (
    <span
      className={
        value > 0
          ? "font-semibold text-stone-800"
          : value < 0
            ? "font-semibold text-emerald-700"
            : "text-stone-400"
      }
    >
      {pkr(Math.abs(value))}
      <span className="ml-2 text-[10px] font-normal">
        {value > 0 ? "DUE" : value < 0 ? "CREDIT" : "SETTLED"}
      </span>
    </span>
  );
}
function Stat({
  label,
  value,
  note,
  icon: Icon,
  featured = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Users;
  featured?: boolean;
}) {
  return (
    <div className={`stat ${featured ? "stat-featured" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="stat-icon">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-tight lg:text-[27px]">
        {value}
      </p>
      <p className="mt-2 text-xs opacity-65">{note}</p>
    </div>
  );
}

export default function MessApp() {
  const [auth, setAuth] = useState<"loading" | "login" | "ready">("loading");
  const [userName, setUserName] = useState("Visitor");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [details, setDetails] = useState<Entity | null>(null);
  const writable = can(sessionUser?.role, "records:write");
  function requestWrite() {
    if (!sessionUser) window.location.assign("/signup");
    else setPendingApproval(true);
  }
  function openEntity(entity: Entity) {
    if (writable) setForm({ kind: entity.kind, entity });
    else setDetails(entity);
  }
  async function refreshIdentity() {
    const data = await getAuth();
    if (data.user?.role !== sessionUser?.role) {
      setForm(null);
      setQuick(false);
      setArchive(null);
      // Reload the appropriate projection before enabling newly approved editing.
      // Never refresh an unchanged-role editor's revision underneath an open form.
      await refresh();
    }
    setSessionUser(data.user || null);
    setUserName(data.user?.name || "Visitor");
    if (!can(data.user?.role, "records:write")) {
      setForm(null);
      setQuick(false);
      setArchive(null);
      setAuditDetail(null);
      setPage((current) => (current === "audit" ? "overview" : current));
    }
    if (!can(data.user?.role, "users:manage"))
      setPage((current) => (current === "users" ? "overview" : current));
  }
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demo, setDemo] = useState(false);
  const [state, setState] = useState<State>({ records: [], revision: 0 });
  const [page, setPage] = useState<Page>("overview");
  const [mobile, setMobile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [memberFilter, setMemberFilter] = useState("All");
  const [secondary, setSecondary] = useState("All");
  const [form, setForm] = useState<{ kind: Kind; entity?: Entity } | null>(
    null,
  );
  const [quick, setQuick] = useState(false);
  const [archive, setArchive] = useState<Entity | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [statementCategory, setStatementCategory] = useState("All");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditMore, setAuditMore] = useState(false);
  const [auditDetail, setAuditDetail] = useState<AuditEntry | null>(null);
  const [reportMode, setReportMode] = useState<"Daily" | "Monthly">("Daily");
  const [attendanceView, setAttendanceView] = useState<"board" | "history">("board");
  const records = state.records;
  const members = byKind(records, "member");
  const name = (id: string) =>
    members.find((m) => m.id === id)?.name || "Unknown member";
  const result = useMemo(() => calculate(records), [records]);
  const asOf = useMemo(() => calculate(records, to), [records, to]);
  const period = (date: string) => date >= from && date <= to;
  const periodLines = result.lines.filter((l) => period(l.date));
  const selectedMeals = result.mealSummaries.filter((m) => period(m.date));
  const totals = {
    food: periodLines
      .filter((l) => l.category === "Food")
      .reduce((n, l) => n + l.debit, 0),
    fuel: periodLines
      .filter(
        (l) =>
          l.category === "Oil" || l.category === "Gas" || l.category === "Chai",
      )
      .reduce((n, l) => n + l.debit, 0),
    shared: periodLines
      .filter((l) => l.category === "Shared")
      .reduce((n, l) => n + l.debit, 0),
    payments: byKind(records, "payment")
      .filter((p) => period(p.date) && p.type === "Deposit")
      .reduce((n, p) => n + p.amount, 0),
  };
  const owed = asOf.settlements.reduce((n, m) => n + Math.max(0, m.balance), 0);
  const credits = asOf.settlements.reduce(
    (n, m) => n + Math.max(0, -m.balance),
    0,
  );
  const currentNav = navigation.find((n) => n.id === page)!;
  function enterDemo() {
    setDemo(true);
    setState({ records: migrateRecords(demoRecords()), revision: 0 });
    setSessionUser({
      id: "demo",
      name: "Demo Admin",
      email: "demo@example.test",
      role: "admin",
    });
    setUserName("Demo Admin");
    setAuth("ready");
    setError("");
  }
  async function refresh() {
    try {
      setState(await getRecords());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setAuth("login");
      throw err;
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      enterDemo();
      return;
    }
    (async () => {
      try {
        const data = await getAuth();
        setNeedsSetup(data.needsSetup);
        setSessionUser(data.user || null);
        setUserName(data.user?.name || "Visitor");
        if (data.needsSetup) setAuth("login");
        else {
          await refresh();
          setAuth("ready");
          setPendingApproval(data.user?.role === "user");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to connect");
        setAuth("login");
      }
    })();
  }, []);
  useEffect(() => {
    if (demo || auth !== "ready") return;
    const onFocus = () => void refreshIdentity().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [demo, auth, sessionUser?.role]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function save(
    upsert: Entity[],
    archived: string[] = [],
    meal?: MealInput,
  ) {
    if (!writable) {
      requestWrite();
      throw new Error(
        "An administrator must approve your account before editing.",
      );
    }
    if (demo) {
      const mutation = prepareRecordMutation(
        { meal, upsert, archive: archived },
        records,
      );
      setState({ records: mutation.next, revision: state.revision + 1 });
    } else {
      try {
        const data = await saveRecords({
          revision: state.revision,
          meal,
          upsert,
          archive: archived,
        });
        setState(data);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          await refreshIdentity();
          setError(
            "Your editing access changed. Sign in or ask an administrator to approve your account.",
          );
        }
        if (err instanceof ApiError && err.status === 409) {
          await refresh();
          setForm(null);
          setError(
            "Another user changed the records. Reopen the meal or expense to review the latest version before editing.",
          );
          throw new Error(
            "Records changed. Reopen this entry to review the latest version.",
          );
        }
        throw err;
      }
    }
    setNotice(
      demo
        ? "Updated in demo. Changes reset when you reload."
        : "Saved. Balances have been recalculated.",
    );
  }
  function navigate(next: Page) {
    if (next === "attendance") {
      setFrom("2000-01-01");
      setTo(today());
    }
    setPage(next);
    setQuery("");
    setFilter("All");
    setSecondary("All");
    setMemberFilter("All");
    setMobile(false);
    setError("");
    if (next === "audit") void loadAudit();
  }
  async function loadAudit(older = false) {
    if (demo) {
      setAudit([]);
      return;
    }
    setAuditBusy(true);
    try {
      const cursor =
        older && audit.length
          ? {
              before: audit[audit.length - 1].at,
              id: audit[audit.length - 1].id,
            }
          : undefined;
      const data = await getAudit(cursor);
      setAudit(older ? [...audit, ...data] : data);
      setAuditMore(data.length === 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load activity");
    } finally {
      setAuditBusy(false);
    }
  }
  const openStatement = (id: string) => {
    setStatementId(id);
    setStatementCategory("All");
  };
  const actionCell = (entity: Entity) =>
    !writable ? (
      <Button variant="ghost" size="sm" onClick={() => setDetails(entity)}>
        View
      </Button>
    ) : (
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit ${kindLabels[entity.kind]}`}
          onClick={() => setForm({ kind: entity.kind, entity })}
        >
          <Pencil size={14} />
        </Button>
        {entity.kind !== "member" && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Archive ${kindLabels[entity.kind]}`}
            onClick={() => setArchive(entity)}
          >
            <Archive size={14} />
          </Button>
        )}
      </div>
    );
  const balanceColumns: ColumnDef<(typeof result.settlements)[number]>[] = [
    {
      accessorKey: "name",
      header: "Member",
      cell: ({ row }) => (
        <button
          onClick={() => openStatement(row.original.id)}
          className="flex items-center gap-3 text-left"
        >
          <Avatar name={row.original.name} index={row.index} />
          <span>
            <strong className="block font-medium">{row.original.name}</strong>
            <small className="text-stone-400">
              {row.original.status} member
            </small>
          </span>
        </button>
      ),
    },
    {
      accessorKey: "food",
      header: "Food",
      cell: ({ getValue }) => pkr(Number(getValue())),
    },
    {
      accessorKey: "fuel",
      header: "Oil, gas & chai",
      cell: ({ getValue }) => pkr(Number(getValue())),
    },
    {
      accessorKey: "shared",
      header: "Shared",
      cell: ({ getValue }) => pkr(Number(getValue())),
    },
    {
      accessorKey: "credit",
      header: "Net credit",
      cell: ({ getValue }) => pkr(Number(getValue())),
    },
    {
      accessorKey: "balance",
      header: "Net balance",
      cell: ({ getValue }) => <Balance value={Number(getValue())} />,
    },
    {
      id: "view",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openStatement(row.original.id)}
          aria-label={`View ${row.original.name} statement`}
        >
          <ArrowUpRight size={16} />
        </Button>
      ),
    },
  ];
  const balanceRows = asOf.settlements.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) &&
      (memberFilter === "All" || m.id === memberFilter) &&
      (filter === "All" ||
        (filter === "Owes mess" && m.balance > 0) ||
        (filter === "In credit" && m.balance < 0) ||
        (filter === "Settled" && m.balance === 0)),
  );
  const balanceExport = balanceRows.map((m) => ({
    Member: m.name,
    Status: m.status,
    "Food PKR": m.food / 100,
    "Fuel PKR": m.fuel / 100,
    "Shared PKR": m.shared / 100,
    "Credit PKR": m.credit / 100,
    "Net due PKR": m.balance / 100,
    "As of": to,
  }));

  if (auth === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f3]">
        <Loader2 className="animate-spin text-emerald-800" />
        <span className="ml-3 text-sm text-stone-500">Opening your mess…</span>
      </div>
    );
  if (auth === "login")
    return (
      <AuthScreen
        mode={needsSetup ? "setup" : "signin"}
        initialError={error}
        onDemo={enterDemo}
        onReady={async () => {
          await refreshIdentity();
          await refresh();
          setAuth("ready");
        }}
      />
    );

  const primaryKind: Partial<Record<Page, Kind>> = {
    members: "member",
    food: "food",
    fuel: "fuel",
    shared: "shared",
    payments: "payment",
  };
  const filterOptions: Partial<Record<Page, string[]>> = {
    members: ["Active", "Left", "Archived"],
    food: [...meals],
    attendance: [...meals],
    fuel: ["Oil", "Gas", "Chai"],
    shared: ["Electricity", "Water", "Cleaning", "Internet", "Salary", "Other"],
    payments: [
      "Deposit",
      "Refund",
      "Reimbursement",
      "Personal purchase",
      "Purchase credit",
    ],
    settlements: ["Owes mess", "In credit", "Settled"],
    reports: [...meals],
    audit: ["create", "update", "archive", "migrate", "user-update"],
  };
  const secondOptions: Partial<Record<Page, string[]>> = {
    fuel: ["Open average", "Closed average", "Direct split"],
    shared: ["Equal", "Manual", "Excluded"],
    payments: ["Cash", "Bank", "JazzCash", "Easypaisa", "Other"],
  };
  const matchesSearch = (entity: Entity) =>
    (
      JSON.stringify(entity) +
      ("memberId" in entity ? name(entity.memberId) : "") +
      ("paidBy" in entity && entity.paidBy ? name(entity.paidBy) : "")
    )
      .toLowerCase()
      .includes(query.toLowerCase());
  const filteredRecords = records.filter((r) => {
    if ("date" in r && !period(r.date)) return false;
    if (!matchesSearch(r)) return false;
    if (
      memberFilter !== "All" &&
      ("memberId" in r
        ? r.memberId !== memberFilter
        : "memberIds" in r
          ? !r.memberIds.includes(memberFilter) &&
            !("paidBy" in r && r.paidBy === memberFilter)
          : false)
    )
      return false;
    if (filter !== "All") {
      if (r.kind === "member" && r.status !== filter) return false;
      if ((r.kind === "food" || r.kind === "cooking") && r.meal !== filter)
        return false;
      if (r.kind === "fuel" && r.resource !== filter) return false;
      if (r.kind === "shared" && r.category !== filter) return false;
      if (r.kind === "payment" && r.type !== filter) return false;
      if (r.kind === "purchase" && filter !== "Personal purchase") return false;
    }
    if (secondary !== "All") {
      if (
        r.kind === "fuel" &&
        (secondary === "Direct split"
          ? r.tier !== "divide_by_people"
          : secondary === "Open average"
            ? r.tier !== "average" || !!r.end
            : r.tier !== "average" || !r.end)
      )
        return false;
      if (
        (r.kind === "shared" || r.kind === "payment") &&
        r.method !== secondary
      )
        return false;
      if (r.kind === "purchase" && page === "payments") return false;
    }
    return true;
  });
  const dateColumn: ColumnDef<Entity> = {
    id: "date",
    accessorFn: (r) => ("date" in r ? r.date : ""),
    header: "Date",
  };
  const amountColumn: ColumnDef<Entity> = {
    id: "amount",
    accessorFn: (r) => ("amount" in r ? r.amount : 0),
    header: "Amount",
    cell: ({ getValue }) => (
      <strong className="font-medium">{pkr(Number(getValue()))}</strong>
    ),
  };
  const buyerColumn: ColumnDef<Entity> = {
    id: "paidBy",
    header: "Paid by",
    accessorFn: (r) =>
      "paidBy" in r && r.paidBy
        ? name(r.paidBy)
        : records.some((p) => p.kind === "purchase" && p.expenseId === r.id)
          ? "Historical buyers"
          : "Mess fund",
  };
  const actionsColumn: ColumnDef<Entity> = {
    id: "actions",
    header: "",
    cell: ({ row }) => actionCell(row.original),
  };
  function entityTable(kind: Kind | Kind[], columns: ColumnDef<Entity>[]) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    const rows = filteredRecords
      .filter((r) => kinds.includes(r.kind))
      .sort((a, b) =>
        ("date" in b ? b.date : "").localeCompare("date" in a ? a.date : ""),
      );
    return (
      <DataTable
        rows={rows}
        columns={columns}
        filename={`messbook-${page}-${from}-${to}`}
        exportRows={rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              [
                "amount",
                "openingCredit",
                "breakfast",
                "lunch",
                "dinner",
                "oilRate",
                "gasRate",
              ].includes(k)
                ? k + " PKR"
                : k,
              k === "memberId" || k === "paidBy"
                ? v
                  ? name(String(v))
                  : "Mess fund"
                : k === "memberIds" && Array.isArray(v)
                  ? v.map((id) => name(String(id))).join("; ")
                  : k === "manual" && typeof v === "object"
                    ? JSON.stringify(
                        Object.fromEntries(
                          Object.entries(v).map(([id, value]) => [
                            name(id) + " PKR",
                            Number(value) / 100,
                          ]),
                        ),
                      )
                    : [
                          "amount",
                          "openingCredit",
                          "breakfast",
                          "lunch",
                          "dinner",
                          "oilRate",
                          "gasRate",
                        ].includes(k)
                      ? Number(v) / 100
                      : typeof v === "object"
                        ? JSON.stringify(v)
                        : v,
            ]),
          ),
        )}
      />
    );
  }
  const dailySpend = [...new Set(periodLines.map((l) => l.date))]
    .sort()
    .map((date) => {
      const lines = periodLines.filter((l) => l.date === date);
      return {
        date,
        food: lines
          .filter((l) => l.category === "Food")
          .reduce((n, l) => n + l.debit, 0),
        fuel: lines
          .filter(
            (l) =>
              l.category === "Oil" ||
              l.category === "Gas" ||
              l.category === "Chai",
          )
          .reduce((n, l) => n + l.debit, 0),
        shared: lines
          .filter((l) => l.category === "Shared")
          .reduce((n, l) => n + l.debit, 0),
      };
    });
  const activeFuel = byKind(records, "fuel").filter(
    (f) => f.tier === "average" && !f.end,
  );
  const statement = statementId
    ? asOf.settlements.find((m) => m.id === statementId)
    : null;
  const allStatementLines = asOf.lines.filter(
    (l) => l.memberId === statementId,
  );
  const statementLines = allStatementLines.filter(
    (l) =>
      period(l.date) &&
      (statementCategory === "All" || l.category === statementCategory),
  );
  const openingBalance = allStatementLines
    .filter((l) => l.date < from)
    .reduce((n, l) => n + l.debit - l.credit, 0);

  return (
    <AccessProvider user={sessionUser} requestWrite={requestWrite}>
      <div className="app-shell">
        {mobile && (
          <button
            className="fixed inset-0 z-30 bg-stone-950/30 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
          <div className="flex items-center gap-3 px-6 pb-9 pt-7">
            <span className="brand-mark">
              <Utensils size={21} />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              messbook<span className="text-emerald-600">.</span>
            </span>
            <button
              className="ml-auto lg:hidden"
              aria-label="Close menu"
              onClick={() => setMobile(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="px-6 pb-4 text-[10px] font-semibold tracking-[.18em] text-stone-400">
            YOUR MESS, IN ORDER
          </div>
          <nav className="space-y-1 px-3">
            {navigation
              .filter((n) =>
                n.id === "users"
                  ? can(sessionUser?.role, "users:manage")
                  : n.id === "audit"
                    ? can(sessionUser?.role, "audit:read")
                    : true,
              )
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? "active" : ""}`}
                  onClick={() => navigate(id)}
                >
                  <Icon size={18} strokeWidth={1.7} />
                  <span>{label}</span>
                  {id === "members" && (
                    <span className="ml-auto text-xs opacity-60">
                      {members.length}
                    </span>
                  )}
                </button>
              ))}
          </nav>
          <div className="mt-auto p-4">
            <div className="rounded-xl bg-[#eef3e9] p-4">
              <Leaf size={20} className="text-emerald-800" />
              <p className="mt-2 text-xs font-semibold text-emerald-950">
                Every rupee accounted for.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                Fair shares. Clear balances.
                <br />A little less to worry about.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-3 px-2">
              <Avatar name={userName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{userName}</p>
                <p className="mt-0.5 text-[10px] text-stone-400">
                  {sessionUser
                    ? sessionUser.role === "user"
                      ? "Awaiting approval"
                      : sessionUser.role
                    : "View-only visitor"}
                </p>
              </div>
              {sessionUser ? (
                <button
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={async () => {
                    if (!demo) {
                      try {
                        await logout();
                      } catch {
                        setError("Sign out failed. Please retry.");
                        return;
                      }
                    }
                    setDemo(false);
                    window.location.assign("/");
                  }}
                >
                  <LogOut size={15} className="text-stone-400" />
                </button>
              ) : (
                <Link href="/signin" className="text-xs text-emerald-700">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden"
                aria-label="Open menu"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <span className="hidden text-xs text-stone-400 sm:inline">
                Workspace
              </span>
              <span className="hidden text-stone-300 sm:inline">/</span>
              <span className="text-xs font-medium">{currentNav.label}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden items-center gap-1.5 text-[11px] text-stone-500 sm:flex">
                <i
                  className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-amber-500" : "bg-emerald-500"}`}
                />
                {demo ? "Demo workspace" : "Connected to your mess"}
              </span>
              <span className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-500">
                PKR
              </span>
              {!sessionUser && (
                <Link
                  href="/signup"
                  className="text-xs font-semibold text-emerald-800"
                >
                  Sign up
                </Link>
              )}
              <Avatar name={userName} />
            </div>
          </header>
          <main className="main-content">
            {demo && (
              <div className="demo-banner">
                <span>
                  <strong>Demo workspace.</strong> Sample data; changes stay in
                  this session.
                </span>
                <button
                  onClick={() => {
                    setDemo(false);
                    setState({ records: [], revision: 0 });
                    setAuth("login");
                  }}
                >
                  Connect your mess <ArrowRight size={13} />
                </button>
              </div>
            )}
            <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-stone-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  {page === "overview"
                    ? "A clearer picture of your mess"
                    : "MESS MANAGEMENT"}
                </div>
                <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
                  {page === "overview"
                    ? "The mess, at a glance"
                    : currentNav.label}
                </h1>
                <p className="mt-2 text-sm text-stone-500">
                  {page === "overview"
                    ? "Good food. Fair shares. Everything in one place."
                    : page === "settlements"
                      ? `Cumulative balances through ${to}. Positive means owed to the mess.`
                      : page === "food"
                        ? "One meal, all ingredients, buyers and eaters in one place."
                        : page === "fuel"
                          ? "Track every purchase, applied rate, and reconciliation."
                          : page === "audit"
                            ? "A traceable history of every financial change."
                            : "Keep the details organized and the numbers clear."}
                </p>
              </div>
              {page !== "users" && (
                <div className="flex gap-2">
                  <Can
                    permission="records:write"
                    fallback={
                      <Button onClick={requestWrite}>
                        <Plus size={17} />
                        Add what’s cooked today
                      </Button>
                    }
                  >
                    {page === "payments" && (
                      <Button
                        variant="outline"
                        onClick={() => setForm({ kind: "purchase" })}
                      >
                        <Plus size={16} />
                        Personal purchase
                      </Button>
                    )}
                    <Button
                      onClick={() =>
                        primaryKind[page]
                          ? setForm({ kind: primaryKind[page]! })
                          : setQuick(true)
                      }
                    >
                      <Plus size={17} />
                      {primaryKind[page]
                        ? `Add ${kindLabels[primaryKind[page]!].toLowerCase()}`
                        : "Quick add"}
                      <ChevronDown size={13} />
                    </Button>
                  </Can>
                </div>
              )}
            </div>
            {error && (
              <div
                role="alert"
                className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"
              >
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError("");
                    if (!demo) void refresh().catch((e) => setError(e.message));
                  }}
                >
                  <RefreshCw size={14} />
                  Refresh
                </Button>
              </div>
            )}
            {page !== "users" && (
              <div className="filter-bar">
                <>
                  <select
                    aria-label="Date range preset"
                    className="control w-auto min-w-36"
                    value={
                      from === monthStart() && to === today()
                        ? "month"
                        : from === today() && to === today()
                          ? "today"
                          : "custom"
                    }
                    onChange={(e) => {
                      if (e.target.value === "month") {
                        setFrom(monthStart());
                        setTo(today());
                      }
                      if (e.target.value === "today") {
                        setFrom(today());
                        setTo(today());
                      }
                      if (e.target.value === "lastmonth") {
                        const d = new Date(today() + "T12:00:00Z");
                        d.setUTCDate(0);
                        setTo(d.toISOString().slice(0, 10));
                        setFrom(d.toISOString().slice(0, 7) + "-01");
                      }
                      if (e.target.value === "all") {
                        setFrom("2000-01-01");
                        setTo(today());
                      }
                    }}
                  >
                    <option value="month">This month</option>
                    <option value="today">Today</option>
                    <option value="lastmonth">Last month</option>
                    <option value="all">All time</option>
                    <option value="custom">Custom range</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      aria-label="Start date"
                      className="w-36"
                      max={to}
                      value={from}
                      onChange={(e) => {
                        if (e.target.value && e.target.value <= to)
                          setFrom(e.target.value);
                      }}
                    />
                    <span className="text-stone-300">—</span>
                    <Input
                      type="date"
                      aria-label="End date"
                      className="w-36"
                      min={from}
                      value={to}
                      onChange={(e) => {
                        if (e.target.value && e.target.value >= from)
                          setTo(e.target.value);
                      }}
                    />
                  </div>
                </>
                {page !== "overview" && (
                  <>
                    <div className="relative min-w-44 flex-1">
                      <Search
                        size={15}
                        className="absolute left-3 top-3.5 text-stone-400"
                      />
                      <Input
                        aria-label="Search records"
                        placeholder="Search records…"
                        className="pl-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    {filterOptions[page] && (
                      <select
                        className="control w-auto"
                        aria-label="Filter records"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>All</option>
                        {filterOptions[page]!.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                    {secondOptions[page] && (
                      <select
                        className="control w-auto"
                        aria-label="Secondary filter"
                        value={secondary}
                        onChange={(e) => setSecondary(e.target.value)}
                      >
                        <option value="All">All methods / tiers</option>
                        {secondOptions[page]!.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    )}
                    {[
                      "payments",
                      "shared",
                      "fuel",
                      "settlements",
                      "food",
                      "attendance",
                    ].includes(page) && (
                      <select
                        className="control w-auto max-w-48"
                        aria-label="Filter by member"
                        value={memberFilter}
                        onChange={(e) => setMemberFilter(e.target.value)}
                      >
                        <option value="All">All members</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {(query ||
                      filter !== "All" ||
                      secondary !== "All" ||
                      memberFilter !== "All") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          setFilter("All");
                          setSecondary("All");
                          setMemberFilter("All");
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </>
                )}
                {page === "overview" && (
                  <span className="ml-auto flex items-center gap-2 text-xs text-stone-400">
                    <SlidersHorizontal size={14} />
                    Your selected period
                  </span>
                )}
              </div>
            )}

            {page === "overview" && (
              <div className="space-y-6">
                <div className="stats-grid">
                  <Stat
                    label="Total allocated expense"
                    value={pkr(totals.food + totals.fuel + totals.shared)}
                    note="Food, cooking fuel & shared costs"
                    icon={Receipt}
                    featured
                  />
                  <Stat
                    label="Contributions received"
                    value={pkr(totals.payments)}
                    note="Deposits in the selected period"
                    icon={ArrowDownLeft}
                  />
                  <Stat
                    label="Outstanding balance"
                    value={pkr(owed)}
                    note={`${asOf.settlements.filter((m) => m.balance > 0).length} members owe · as of ${to}`}
                    icon={Wallet}
                  />
                  <Stat
                    label="Active members"
                    value={String(
                      members.filter((m) => m.status === "Active").length,
                    ).padStart(2, "0")}
                    note={`${pkr(credits)} held in member credit`}
                    icon={Users}
                  />
                </div>
                <div className="dashboard-charts">
                  <section className="panel p-5 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="section-title">Where the money goes</h2>
                        <p className="mt-1 text-xs text-stone-400">
                          Daily allocated expenses · PKR
                        </p>
                      </div>
                      <div className="flex gap-3 text-[10px] text-stone-500">
                        <span>
                          <i className="legend-dot bg-emerald-700" />
                          Food
                        </span>
                        <span>
                          <i className="legend-dot bg-amber-500" />
                          Fuel
                        </span>
                        <span>
                          <i className="legend-dot bg-slate-400" />
                          Shared
                        </span>
                      </div>
                    </div>
                    <SpendChart data={dailySpend} />
                  </section>
                  <section className="panel p-6">
                    <h2 className="section-title">Expense breakdown</h2>
                    <p className="mt-1 text-xs text-stone-400">
                      A fair share of every rupee
                    </p>
                    <SplitChart
                      data={[
                        {
                          name: "Meal expenses",
                          value: totals.food,
                          color: "#17664e",
                        },
                        {
                          name: "Oil, gas & chai",
                          value: totals.fuel,
                          color: "#d2ad65",
                        },
                        {
                          name: "Shared expenses",
                          value: totals.shared,
                          color: "#b6c8ab",
                        },
                      ]}
                    />
                  </section>
                </div>
                <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
                  <section className="panel p-6">
                    <div className="flex items-center justify-between">
                      <h2 className="section-title">Today at the table</h2>
                      <button
                        className="text-xs font-medium text-emerald-800"
                        onClick={() => navigate("food")}
                      >
                        Manage meals{" "}
                        <ArrowUpRight className="inline" size={13} />
                      </button>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      {meals.map((meal, i) => {
                        const summary = result.mealSummaries.find(
                          (m) => m.date === today() && m.meal === meal,
                        );
                        const Icon = [Coffee, Sun, Moon][i];
                        return (
                          <div
                            key={meal}
                            className="rounded-xl border border-stone-100 bg-stone-50/70 p-3 sm:p-4"
                          >
                            <div className="flex items-center gap-2 text-xs text-stone-500">
                              <Icon size={16} className="text-emerald-700" />
                              {meal}
                            </div>
                            <p className="mt-4 text-2xl font-semibold">
                              {summary?.eaters || 0}
                              <span className="ml-1 text-[10px] font-normal text-stone-400">
                                eaters
                              </span>
                            </p>
                            <p className="mt-2 text-[11px] text-stone-500">
                              {summary?.total
                                ? pkr(summary.total)
                                : "No expenses yet"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  <section className="panel p-6">
                    <div className="flex items-center justify-between">
                      <h2 className="section-title">Kitchen supplies</h2>
                      <button
                        className="text-xs font-medium text-emerald-800"
                        onClick={() => navigate("fuel")}
                      >
                        View all <ArrowUpRight className="inline" size={13} />
                      </button>
                    </div>
                    <div className="mt-4 space-y-4">
                      {activeFuel.slice(0, 3).map((f) => {
                        const charged = result.fuelCharged[f.id] || 0;
                        return (
                          <div key={f.id}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {f.resource}
                                <span className="ml-2 font-normal text-stone-400">
                                  {f.date}
                                </span>
                              </span>
                              <Badge
                                tone={charged > f.amount ? "amber" : "green"}
                              >
                                {charged > f.amount ? "Overcharged" : "Open"}
                              </Badge>
                            </div>
                            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className={`h-full rounded-full ${charged > f.amount ? "bg-amber-500" : "bg-emerald-700"}`}
                                style={{
                                  width: `${Math.min(100, (charged / f.amount) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-stone-400">
                              {pkr(charged)} charged against {pkr(f.amount)}
                            </p>
                          </div>
                        );
                      })}
                      {!activeFuel.length && (
                        <p className="py-8 text-center text-sm text-stone-400">
                          No open oil, gas or chai entries.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
                {result.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    <div className="mb-2 flex items-center gap-2 font-semibold">
                      <AlertTriangle size={15} />
                      Attendance needs attention
                    </div>
                    {result.warnings.slice(0, 5).map((w) => (
                      <p key={w} className="mt-1">
                        {w}
                      </p>
                    ))}
                    {result.warnings.length > 5 && (
                      <p className="mt-2">
                        {result.warnings.length - 5} more warnings. Review the
                        daily report.
                      </p>
                    )}
                  </div>
                )}
                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="section-title">Member balances</h2>
                      <p className="mt-1 text-xs text-stone-400">
                        Cumulative through {to} · everything accounted for
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("settlements")}
                    >
                      All settlements <ArrowUpRight size={14} />
                    </Button>
                  </div>
                  <DataTable
                    rows={asOf.settlements.slice(0, 5)}
                    columns={balanceColumns}
                  />
                </section>
              </div>
            )}

            {page === "members" &&
              entityTable("member", [
                {
                  id: "name",
                  accessorFn: (r) => (r.kind === "member" ? r.name : ""),
                  header: "Member",
                  cell: ({ row }) => {
                    const m = row.original as Member;
                    return (
                      <button
                        className="flex items-center gap-3 text-left"
                        onClick={() => openStatement(m.id)}
                      >
                        <Avatar name={m.name} index={row.index} />
                        <span>
                          <strong className="font-medium">{m.name}</strong>
                          <small className="mt-1 block text-stone-400">
                            {m.phone || "No phone added"}
                          </small>
                        </span>
                      </button>
                    );
                  },
                },
                {
                  id: "status",
                  accessorFn: (r) => (r.kind === "member" ? r.status : ""),
                  header: "Status",
                  cell: ({ getValue }) => (
                    <Badge tone={getValue() === "Active" ? "green" : "gray"}>
                      {String(getValue())}
                    </Badge>
                  ),
                },
                {
                  id: "arrival",
                  accessorFn: (r) =>
                    r.kind === "member" ? r.arrival.replace("T", " ") : "",
                  header: "First arrival",
                },
                {
                  id: "stays",
                  header: "Stay history",
                  cell: ({ row }) =>
                    row.original.kind === "member" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetails(row.original)}
                      >
                        {memberStays(row.original).length} stay(s)
                      </Button>
                    ),
                },
                {
                  id: "balance",
                  header: "Balance",
                  cell: ({ row }) => (
                    <Balance
                      value={
                        asOf.settlements.find((m) => m.id === row.original.id)
                          ?.balance || 0
                      }
                    />
                  ),
                },
                actionsColumn,
              ])}
            {page === "food" && (
              <MealsTable
                records={records}
                from={from}
                to={to}
                query={query}
                filter={filter}
                memberFilter={memberFilter}
                onEdit={(date, meal) =>
                  openEntity({
                    id: "meal-editor",
                    kind: "food",
                    date,
                    meal,
                    description: "",
                    amount: 0,
                  })
                }
              />
            )}
            {page === "fuel" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900">
                  Average entries keep charging until closed. Differences below
                  are for manual reconciliation; no automatic adjustment is
                  posted. Charged totals include the entire entry history.
                </div>
                {entityTable("fuel", [
                  dateColumn,
                  {
                    id: "resource",
                    accessorFn: (r) => (r.kind === "fuel" ? r.resource : ""),
                    header: "Resource",
                    cell: ({ row }) =>
                      row.original.kind === "fuel" ? (
                        <span className="font-medium">
                          {row.original.resource}
                          <small className="mt-1 block max-w-64 truncate font-normal text-stone-400">
                            {row.original.notes}
                          </small>
                        </span>
                      ) : (
                        ""
                      ),
                  },
                  {
                    id: "tier",
                    header: "Tier / status",
                    cell: ({ row }) =>
                      row.original.kind === "fuel" ? (
                        <Badge tone={row.original.end ? "gray" : "green"}>
                          {row.original.tier === "divide_by_people"
                            ? "Direct split"
                            : row.original.end
                              ? "Average · Closed"
                              : "Average · Open"}
                        </Badge>
                      ) : (
                        ""
                      ),
                  },
                  amountColumn,
                  buyerColumn,
                  {
                    id: "charged",
                    accessorFn: (r) => result.fuelCharged[r.id] || 0,
                    header: "Charged",
                    cell: ({ getValue }) => pkr(Number(getValue())),
                  },
                  {
                    id: "difference",
                    header: "Reconciliation",
                    cell: ({ row }) => {
                      const e = row.original;
                      if (e.kind !== "fuel") return null;
                      const diff = (result.fuelCharged[e.id] || 0) - e.amount;
                      return (
                        <span
                          className={
                            diff > 0 ? "text-amber-700" : "text-stone-500"
                          }
                        >
                          {diff === 0
                            ? "Fully allocated"
                            : `${pkr(Math.abs(diff))} ${diff > 0 ? "overcharged" : "undercharged"}`}
                        </span>
                      );
                    },
                  },
                  actionsColumn,
                ])}
              </div>
            )}
            {page === "shared" &&
              entityTable("shared", [
                buyerColumn,
                dateColumn,
                {
                  id: "category",
                  accessorFn: (r) => (r.kind === "shared" ? r.category : ""),
                  header: "Category",
                },
                {
                  id: "description",
                  accessorFn: (r) => (r.kind === "shared" ? r.description : ""),
                  header: "Description",
                },
                amountColumn,
                {
                  id: "method",
                  accessorFn: (r) => (r.kind === "shared" ? r.method : ""),
                  header: "Allocation",
                  cell: ({ getValue }) => (
                    <Badge tone="gray">{String(getValue())}</Badge>
                  ),
                },
                {
                  id: "members",
                  accessorFn: (r) =>
                    r.kind === "shared" ? r.memberIds.length : 0,
                  header: "Members",
                },
                actionsColumn,
              ])}
            {page === "payments" && (
              <PaymentHistory
                records={records}
                from={from}
                to={to}
                query={query}
                type={filter}
                method={secondary}
                memberId={memberFilter}
                actions={actionCell}
                onSource={openEntity}
              />
            )}
            {page === "attendance" && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
                  <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setAttendanceView("board")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        attendanceView === "board"
                          ? "bg-emerald-800 text-white shadow-sm"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      Attendance Board
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceView("history")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        attendanceView === "history"
                          ? "bg-emerald-800 text-white shadow-sm"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      Attendance History
                    </button>
                  </div>
                  {attendanceView === "board" && (
                    <span className="text-xs text-stone-500">
                      Date: <strong className="text-stone-800">{to}</strong>
                    </span>
                  )}
                </div>

                {attendanceView === "board" ? (
                  <AttendanceBoard
                    records={records}
                    date={to}
                    save={save}
                    addCooking={() => setForm({ kind: "cooking" })}
                  />
                ) : (
                  <AttendanceHistory
                    records={records}
                    from={from}
                    to={to}
                    query={query}
                    mealFilter={filter}
                    memberFilter={memberFilter}
                  />
                )}
              </div>
            )}
            {page === "users" && (
              <Can permission="users:manage">
                <UsersPage demo={demo} onChanged={refreshIdentity} />
              </Can>
            )}
            {page === "settlements" && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat
                    label="To collect"
                    value={pkr(owed)}
                    note={`As of ${to}`}
                    icon={ArrowDownLeft}
                  />
                  <Stat
                    label="Member credit"
                    value={pkr(credits)}
                    note="Mess owes these members"
                    icon={ArrowUpRight}
                  />
                  <Stat
                    label="Settled members"
                    value={String(
                      asOf.settlements.filter((m) => m.balance === 0).length,
                    )}
                    note="Zero outstanding balance"
                    icon={Check}
                  />
                </div>
                <p className="text-xs text-stone-500">
                  Opening credit and all entries through the end date are
                  included. The start date applies to the statement view. Direct
                  fuel charges are included once in Oil, gas & chai.
                </p>
                <DataTable
                  rows={balanceRows}
                  columns={balanceColumns}
                  exportRows={balanceExport}
                  filename={`settlements-as-of-${to}`}
                />
              </div>
            )}
            {page === "reports" && (
              <Reports
                records={records}
                from={from}
                to={to}
                query={query}
                mealFilter={filter}
                mode={reportMode}
                setMode={setReportMode}
              />
            )}
            {page === "audit" && can(sessionUser?.role, "audit:read") && (
              <div className="space-y-4">
                {demo && (
                  <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    Audit history is stored for real workspace changes. Demo
                    changes are temporary.
                  </p>
                )}
                {auditBusy && (
                  <p className="text-sm text-stone-500">Loading activity…</p>
                )}
                <DataTable
                  rows={audit.filter(
                    (a) =>
                      period(a.at.slice(0, 10)) &&
                      (filter === "All" || a.action === filter) &&
                      JSON.stringify(a)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )}
                  columns={[
                    { accessorKey: "at", header: "Time (UTC)" },
                    { accessorKey: "user_name", header: "Changed by" },
                    {
                      accessorKey: "action",
                      header: "Action",
                      cell: ({ getValue }) => (
                        <Badge tone="gray">{String(getValue())}</Badge>
                      ),
                    },
                    { accessorKey: "record_id", header: "Record ID" },
                    {
                      id: "details",
                      header: "",
                      cell: ({ row }) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAuditDetail(row.original)}
                        >
                          View changes <ArrowUpRight size={14} />
                        </Button>
                      ),
                    },
                  ]}
                />
                {auditMore && (
                  <Button
                    disabled={auditBusy}
                    variant="outline"
                    onClick={() => loadAudit(true)}
                  >
                    Load older activity
                  </Button>
                )}
              </div>
            )}
            <footer className="mt-9 flex flex-wrap justify-between gap-2 border-t border-stone-200/70 pt-4 text-[10px] text-stone-400">
              <span>messbook · Made for a well-run mess</span>
              <span>All amounts in PKR · Dates in Pakistan time</span>
            </footer>
          </main>
        </div>
        {notice && (
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-[80] flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl bg-emerald-950 px-5 py-3 text-sm text-white shadow-lg"
          >
            <Check size={16} />
            {notice}
          </div>
        )}
        {writable &&
          form &&
          (form.kind === "food" || form.kind === "cooking" ? (
            <MealForm
              key={form.entity?.id || "new-meal"}
              records={records}
              date={
                form.entity && "date" in form.entity
                  ? form.entity.date
                  : undefined
              }
              meal={
                form.entity && "meal" in form.entity
                  ? form.entity.meal
                  : undefined
              }
              onClose={() => setForm(null)}
              onSave={(meal) => save([], [], meal)}
            />
          ) : (
            <EntryForm
              key={`${form.kind}-${form.entity?.id || "new"}`}
              kind={form.kind}
              editing={form.entity}
              records={records}
              onClose={() => setForm(null)}
              onSave={(entity) => save([entity])}
            />
          ))}
        <Dialog open={writable && quick} onOpenChange={setQuick}>
          <DialogContent>
            <DialogTitle className="text-xl font-semibold">
              What would you like to record?
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-stone-500">
              A small update keeps everyone’s balance clear.
            </DialogDescription>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {(
                [
                  "member",
                  "food",
                  "fuel",
                  "shared",
                  "payment",
                  "purchase",
                ] as Kind[]
              ).map((kind) => (
                <button
                  key={kind}
                  className="rounded-xl border border-stone-200 p-4 text-left text-sm font-medium transition hover:border-emerald-700 hover:bg-emerald-50"
                  onClick={() => {
                    setQuick(false);
                    setForm({ kind });
                  }}
                >
                  <Plus size={17} className="mb-3 text-emerald-700" />
                  {kindLabels[kind]}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={writable && !!archive}
          onOpenChange={(v) => !v && !archiving && setArchive(null)}
        >
          <DialogContent>
            <DialogTitle className="text-xl font-semibold">
              Archive this entry?
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-relaxed text-stone-500">
              It will be removed from calculations. The original record and this
              action stay in the audit history. Dependent records must be
              corrected first.
            </DialogDescription>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={archiving}
                onClick={() => setArchive(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={archiving}
                onClick={async () => {
                  if (!archive) return;
                  setArchiving(true);
                  try {
                    await save([], [archive.id]);
                    setArchive(null);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Unable to archive",
                    );
                    setArchive(null);
                  } finally {
                    setArchiving(false);
                  }
                }}
              >
                Archive entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!statement}
          onOpenChange={(v) => !v && setStatementId(null)}
        >
          <DialogContent className="max-w-5xl">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold">
              {statement && <Avatar name={statement.name} />}
              {statement?.name}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-stone-500">
              Resident statement · {from} to {to}. Running balances include all
              earlier entries.
            </DialogDescription>
            <div className="my-5 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-stone-50 p-4">
                <p className="text-xs text-stone-500">
                  Opening balance before {from}
                </p>
                <p className="mt-2">
                  <Balance value={openingBalance} />
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs text-emerald-700">
                  Closing balance at {to}
                </p>
                <p className="mt-2">
                  <Balance value={statement?.balance || 0} />
                </p>
              </div>
            </div>
            <div className="mb-4 flex justify-between gap-3">
              <select
                aria-label="Statement category"
                className="control w-auto"
                value={statementCategory}
                onChange={(e) => setStatementCategory(e.target.value)}
              >
                <option value="All">All ledger categories</option>
                {[
                  "Opening",
                  "Food",
                  "Oil",
                  "Gas",
                  "Chai",
                  "Shared",
                  "Payment",
                  "Purchase",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                Print
              </Button>
            </div>
            <DataTable
              rows={statementLines}
              columns={[
                { accessorKey: "date", header: "Date" },
                { accessorKey: "description", header: "Description" },
                {
                  accessorKey: "debit",
                  header: "Charge",
                  cell: ({ getValue }) =>
                    Number(getValue()) ? pkr(Number(getValue())) : "—",
                },
                {
                  accessorKey: "credit",
                  header: "Credit",
                  cell: ({ getValue }) =>
                    Number(getValue()) ? pkr(Number(getValue())) : "—",
                },
                {
                  accessorKey: "balance",
                  header: "Running balance",
                  cell: ({ getValue }) => pkr(Number(getValue())),
                },
              ]}
              exportRows={statementLines.map((l) => ({
                Date: l.date,
                Member: statement?.name,
                Category: l.category,
                Description: l.description,
                "Charge PKR": l.debit / 100,
                "Credit PKR": l.credit / 100,
                "Running balance PKR": l.balance / 100,
              }))}
              filename={`statement-${statement?.name}-${from}-${to}`}
            />
            <p className="mt-3 text-xs text-stone-400">
              Positive = member owes the mess. Negative = mess owes the member.
              Category filters retain the full ledger’s running balance.
            </p>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!auditDetail}
          onOpenChange={(v) => !v && setAuditDetail(null)}
        >
          <DialogContent className="max-w-3xl">
            <DialogTitle className="text-xl font-semibold">
              Audit record
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-stone-500">
              {auditDetail?.user_name} · {auditDetail?.action} ·{" "}
              {auditDetail?.at}
            </DialogDescription>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(["old_value", "new_value"] as const).map((k) => (
                <div key={k}>
                  <h3 className="mb-2 text-sm font-medium">
                    {k === "old_value" ? "Before" : "After"}
                  </h3>
                  <pre className="max-h-96 overflow-auto rounded-xl bg-stone-50 p-4 text-xs">
                    {auditDetail
                      ? JSON.stringify(
                          JSON.parse(auditDetail[k] || "null"),
                          null,
                          2,
                        )
                      : ""}
                  </pre>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        {details && (
          <RecordDetails
            record={details}
            records={records}
            onClose={() => setDetails(null)}
          />
        )}
        <Dialog
          open={pendingApproval && sessionUser?.role === "user"}
          onOpenChange={setPendingApproval}
        >
          <DialogContent>
            <DialogTitle className="text-xl font-semibold">
              You’re in — approval is next
            </DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-relaxed text-stone-500">
              You can explore meals, attendance and balances now. You’ll be able
              to add meals and expenses after an administrator approves you as a
              moderator.
            </DialogDescription>
            <Button className="mt-6" onClick={() => setPendingApproval(false)}>
              Explore the mess
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AccessProvider>
  );
}

function Reports({
  records,
  from,
  to,
  query,
  mealFilter,
  mode,
  setMode,
}: {
  records: Entity[];
  from: string;
  to: string;
  query: string;
  mealFilter: string;
  mode: "Daily" | "Monthly";
  setMode: (v: "Daily" | "Monthly") => void;
}) {
  const all = calculate(records);
  const inside = (date: string) => date >= from && date <= to;
  const rows = all.mealSummaries.filter(
    (r) =>
      inside(r.date) &&
      (mealFilter === "All" || r.meal === mealFilter) &&
      `${r.date} ${r.meal}`.toLowerCase().includes(query.toLowerCase()),
  );
  const days = [
    ...new Set(
      records
        .filter((r) => "date" in r && inside(r.date))
        .map((r) => ("date" in r ? r.date : "")),
    ),
  ].sort();
  const grouped = [
    ...new Set(days.map((d) => (mode === "Daily" ? d : d.slice(0, 7)))),
  ]
    .map((period) => {
      const match = (d: string) => inside(d) && d.startsWith(period);
      const mealsForPeriod = rows.filter((r) => match(r.date));
      return {
        period,
        breakfast: mealsForPeriod
          .filter((m) => m.meal === "Breakfast")
          .reduce((n, m) => n + m.food, 0),
        lunch: mealsForPeriod
          .filter((m) => m.meal === "Lunch")
          .reduce((n, m) => n + m.food, 0),
        dinner: mealsForPeriod
          .filter((m) => m.meal === "Dinner")
          .reduce((n, m) => n + m.food, 0),
        oil: mealsForPeriod.reduce((n, m) => n + m.oil, 0),
        gas: mealsForPeriod.reduce((n, m) => n + m.gas, 0),
        chai: mealsForPeriod.reduce((n, m) => n + m.chai, 0),
        directChai: byKind(records, "fuel")
          .filter(
            (f) =>
              match(f.date) &&
              f.tier === "divide_by_people" &&
              f.resource === "Chai",
          )
          .reduce((n, f) => n + f.amount, 0),
        directOil: byKind(records, "fuel")
          .filter(
            (f) =>
              match(f.date) &&
              f.tier === "divide_by_people" &&
              f.resource === "Oil",
          )
          .reduce((n, f) => n + f.amount, 0),
        directGas: byKind(records, "fuel")
          .filter(
            (f) =>
              match(f.date) &&
              f.tier === "divide_by_people" &&
              f.resource === "Gas",
          )
          .reduce((n, f) => n + f.amount, 0),
        shared: byKind(records, "shared")
          .filter((s) => match(s.date) && s.method !== "Excluded")
          .reduce((n, s) => n + s.amount, 0),
        deposits: byKind(records, "payment")
          .filter((p) => match(p.date) && p.type === "Deposit")
          .reduce((n, p) => n + p.amount, 0),
        refunds: byKind(records, "payment")
          .filter((p) => match(p.date) && p.type === "Refund")
          .reduce((n, p) => n + p.amount, 0),
        purchaseCredits: all.lines
          .filter((l) => match(l.date) && l.category === "Purchase")
          .reduce((n, l) => n + l.credit, 0),
        reimbursements: byKind(records, "payment")
          .filter((p) => match(p.date) && p.type === "Reimbursement")
          .reduce((n, p) => n + p.amount, 0),
      };
    })
    .filter(
      (r) =>
        r.period.includes(query) ||
        !query ||
        rows.some((m) => m.date.startsWith(r.period)),
    );
  const moneyColumns = (
    [
      "breakfast",
      "lunch",
      "dinner",
      "oil",
      "gas",
      "chai",
      "directChai",
      "directOil",
      "directGas",
      "shared",
      "deposits",
      "refunds",
      "reimbursements",
      "purchaseCredits",
    ] as const
  ).map((key) => ({
    accessorKey: key,
    header:
      (
        {
          oil: "Oil · average",
          gas: "Gas · average",
          chai: "Chai · average",
          directChai: "Chai · direct",
          purchaseCredits: "Purchase credits",
          directOil: "Oil · direct",
          directGas: "Gas · direct",
        } as Record<string, string>
      )[key] || key[0].toUpperCase() + key.slice(1),
    cell: ({ getValue }: { getValue: () => unknown }) =>
      pkr(Number(getValue())),
  }));
  const categories = [
    "Electricity",
    "Water",
    "Cleaning",
    "Internet",
    "Salary",
    "Other",
  ].map((category) => ({
    category,
    amount: byKind(records, "shared")
      .filter(
        (s) =>
          inside(s.date) && s.category === category && s.method !== "Excluded",
      )
      .reduce((n, s) => n + s.amount, 0),
  }));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1">
          {(["Daily", "Monthly"] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode(m)}
            >
              {m} summary
            </Button>
          ))}
        </div>
        <span className="text-xs text-stone-400">Amounts in PKR</span>
      </div>
      <DataTable
        rows={grouped}
        columns={[
          {
            accessorKey: "period",
            header: mode === "Daily" ? "Date" : "Month",
          },
          ...moneyColumns,
        ]}
        exportRows={grouped.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              typeof v === "number" ? k + " PKR" : k,
              typeof v === "number" ? v / 100 : v,
            ]),
          ),
        )}
        filename={`report-${mode.toLowerCase()}-${from}-${to}`}
      />
      <section>
        <h2 className="section-title mb-4">Meal-by-meal detail</h2>
        <DataTable
          rows={rows}
          columns={[
            { accessorKey: "date", header: "Date" },
            { accessorKey: "meal", header: "Meal" },
            { accessorKey: "eaters", header: "Eaters" },
            {
              accessorKey: "total",
              header: "Total incl. fuel",
              cell: ({ getValue }) => pkr(Number(getValue())),
            },
            {
              accessorKey: "perEater",
              header: "Average / eater",
              cell: ({ row }) =>
                row.original.eaters ? (
                  pkr(row.original.perEater)
                ) : (
                  <Badge tone="amber">No eaters</Badge>
                ),
            },
            { accessorKey: "oilId", header: "Oil entry" },
            { accessorKey: "gasId", header: "Gas entry" },
            { accessorKey: "chaiId", header: "Chai entry" },
          ]}
          exportRows={rows.map((r) => ({
            Date: r.date,
            Meal: r.meal,
            Eaters: r.eaters,
            "Food PKR": r.food / 100,
            "Oil PKR": r.oil / 100,
            "Gas PKR": r.gas / 100,
            "Chai PKR": r.chai / 100,
            "Total PKR": r.total / 100,
            "Average per eater PKR": r.perEater / 100,
            "Oil entry": r.oilId,
            "Gas entry": r.gasId,
            "Chai entry": r.chaiId,
            Warning: r.total && !r.eaters ? "Expense exists but no eaters" : "",
          }))}
          filename={`meals-${from}-${to}`}
        />
      </section>
      <section>
        <h2 className="section-title mb-4">Shared expenses by category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {categories.map((c) => (
            <div key={c.category} className="panel p-4">
              <p className="text-xs text-stone-400">{c.category}</p>
              <strong className="mt-2 block text-sm">{pkr(c.amount)}</strong>
            </div>
          ))}
        </div>
      </section>
      {mode === "Monthly" && (
        <MonthlySettlements
          records={records}
          from={from}
          to={to}
          query={query}
        />
      )}
      <p className="text-xs text-stone-500">
        Meal totals show recorded costs, including meals awaiting attendance.
        Shared totals exclude owner-only entries. Open Settlements for resident
        balances through the selected end date.
      </p>
    </div>
  );
}
