"use client";

import { useState, useMemo } from "react";
import {
  Check,
  Save,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Utensils,
  CheckCheck,
} from "lucide-react";

import { useState, useMemo } from "react";
import {
  Check,
  Save,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Utensils,
  CheckCheck,
} from "lucide-react";
import { byKind, meals, type Entity, type Meal } from "@/lib/domain";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

// Chronological meals: ["Breakfast", "Lunch", "Dinner"]
// Latest meal first order: Dinner (latest) -> Lunch -> Breakfast (earliest)
const MEALS_LATEST_FIRST: Meal[] = ["Dinner", "Lunch", "Breakfast"];

const MEAL_DETAILS: Record<
  Meal,
  { label: string; badge: string; timeDesc: string; orderRank: number }
> = {
  Dinner: {
    label: "Dinner",
    badge: "Latest",
    timeDesc: "Evening / Night",
    orderRank: 3,
  },
  Lunch: {
    label: "Lunch",
    badge: "Midday",
    timeDesc: "Afternoon",
    orderRank: 2,
  },
  Breakfast: {
    label: "Breakfast",
    badge: "Morning",
    timeDesc: "Morning",
    orderRank: 1,
  },
};


// Chronological meals: ["Breakfast", "Lunch", "Dinner"]
// Latest meal first order: Dinner (latest) -> Lunch -> Breakfast (earliest)
const MEALS_LATEST_FIRST: Meal[] = ["Dinner", "Lunch", "Breakfast"];

const MEAL_DETAILS: Record<
  Meal,
  { label: string; badge: string; timeDesc: string; orderRank: number }
> = {
  Dinner: {
    label: "Dinner",
    badge: "Latest",
    timeDesc: "Evening / Night",
    orderRank: 3,
  },
  Lunch: {
    label: "Lunch",
    badge: "Midday",
    timeDesc: "Afternoon",
    orderRank: 2,
  },
  Breakfast: {
    label: "Breakfast",
    badge: "Morning",
    timeDesc: "Morning",
    orderRank: 1,
  },
};

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

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sort & Filter state
  const [sortBy, setSortBy] = useState<
    "latest-meal" | "name" | "most-eaten" | "not-eaten-first"
  >("latest-meal");
  const [mealFilter, setMealFilter] = useState<"All" | "Eaten" | "NotEaten">(
    "All",
  );

  const members = byKind(records, "member").filter(
    (m) =>
      (m.status === "Active" || existing.some((a) => a.memberId === m.id)) &&
      m.arrival.slice(0, 10) <= date &&
      (!m.departure || m.departure.slice(0, 10) >= date),
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

  // Compute latest meal rank for a member (Dinner=3, Lunch=2, Breakfast=1, None=0)
  const getLatestMealRank = (memberId: string): number => {
    if (selected.has(`${memberId}|Dinner`)) return 3;
    if (selected.has(`${memberId}|Lunch`)) return 2;
    if (selected.has(`${memberId}|Breakfast`)) return 1;
    return 0;
  };

  const getEatenMealsCount = (memberId: string): number => {
    let count = 0;
    if (selected.has(`${memberId}|Dinner`)) count++;
    if (selected.has(`${memberId}|Lunch`)) count++;
    if (selected.has(`${memberId}|Breakfast`)) count++;
    return count;
  };

  // Filter and sort members
  const filteredAndSortedMembers = useMemo(() => {
    // 1. Text Search Query
    let result = members.filter((m) =>
      m.name.toLowerCase().includes(query.trim().toLowerCase()),
    );

    // 2. Meal Attendance Filter
    if (mealFilter === "Eaten") {
      result = result.filter((m) => getEatenMealsCount(m.id) > 0);
    } else if (mealFilter === "NotEaten") {
      result = result.filter((m) => getEatenMealsCount(m.id) === 0);
    }

    // 3. Sort list: Default order by latest meal time at first and then goes backward
    result.sort((a, b) => {
      if (sortBy === "latest-meal") {
        const rankA = getLatestMealRank(a.id);
        const rankB = getLatestMealRank(b.id);
        if (rankB !== rankA) {
          return rankB - rankA; // Highest latest meal first: Dinner(3) -> Lunch(2) -> Breakfast(1) -> None(0)
        }
        // Secondary sort: most meals eaten descending
        const countA = getEatenMealsCount(a.id);
        const countB = getEatenMealsCount(b.id);
        if (countB !== countA) return countB - countA;
        return a.name.localeCompare(b.name);
      }

      if (sortBy === "most-eaten") {
        const countA = getEatenMealsCount(a.id);
        const countB = getEatenMealsCount(b.id);
        if (countB !== countA) return countB - countA;
        return a.name.localeCompare(b.name);
      }

      if (sortBy === "not-eaten-first") {
        const countA = getEatenMealsCount(a.id);
        const countB = getEatenMealsCount(b.id);
        if (countA !== countB) return countA - countB;
        return a.name.localeCompare(b.name);
      }

      // Default: Alphabetical by name
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [members, query, mealFilter, sortBy, selected]);

  // Pagination calculation
  const totalItems = filteredAndSortedMembers.length;
  const isAllPages = pageSize >= 9999;
  const totalPages = isAllPages
    ? 1
    : Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedMembers = useMemo(() => {
    if (isAllPages) return filteredAndSortedMembers;
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedMembers.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedMembers, safeCurrentPage, pageSize, isAllPages]);

  // Handle page resets on search or filter change
  const handleQueryChange = (val: string) => {
    setQuery(val);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (val: number) => {
    setPageSize(val);
    setCurrentPage(1);
  };

  // Batch toggle for a specific meal
  const toggleAllForMeal = (meal: Meal) => {
    const next = new Set(selected);
    const targetMembers = filteredAndSortedMembers;
    const allChecked = targetMembers.every((m) => next.has(`${m.id}|${meal}`));

    targetMembers.forEach((m) => {
      const key = `${m.id}|${meal}`;
      if (allChecked) {
        next.delete(key);
      } else {
        next.add(key);
      }
    });

    setSelected(next);
    setSaved(false);
  };

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
      {/* Meal Summary Cards — Ordered by latest meal first: Dinner -> Lunch -> Breakfast */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MEALS_LATEST_FIRST.map((meal) => {
          const meta = MEAL_DETAILS[meal];
          const count = members.filter((m) =>
            selected.has(`${m.id}|${meal}`),
          ).length;
          return (
            <div
              className="panel relative overflow-hidden p-4 sm:p-5 border border-stone-200/80 bg-white"
              key={meal}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    {meta.label}
                  </span>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {meta.timeDesc}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                    meal === "Dinner"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : meal === "Lunch"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-sky-200 bg-sky-50 text-sky-800"
                  }`}
                >
                  {meta.badge}
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-stone-900">
                {count}
                <span className="ml-2 text-sm font-normal text-stone-400">
                  / {members.length} eaters
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Main Attendance Table Panel */}
      <div className="panel overflow-hidden border border-stone-200/80 bg-white shadow-sm">
        {/* Header Controls: Search, Sort, Filter */}
        <div className="flex flex-col gap-4 border-b border-stone-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-stone-900 text-base flex items-center gap-2">
                <Utensils size={18} className="text-emerald-700" />
                Member Meal Attendance
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Mark who ate breakfast, lunch, or dinner on {date}. Ordered by
                latest meal time first.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Input
                className="w-full sm:w-60"
                placeholder="Find member…"
                aria-label="Find member for attendance"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
              />
            </div>
          </div>

          {/* Secondary Controls: Sorting & Filter Chips */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-stone-500 font-medium flex items-center gap-1">
                <ArrowUpDown size={13} />
                Sort:
              </span>
              <select
                aria-label="Sort attendance list"
                className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 font-medium focus:border-emerald-600 focus:outline-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="latest-meal">
                  Latest meal time first (Dinner → Lunch → Breakfast)
                </option>
                <option value="most-eaten">
                  Most meals eaten first (3 → 0)
                </option>
                <option value="not-eaten-first">
                  Unmarked / Not eaten first
                </option>
                <option value="name">Member Name (A → Z)</option>
              </select>

              <span className="mx-1 text-stone-300">|</span>

              <span className="text-stone-500 font-medium">Filter:</span>
              <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                {(["All", "Eaten", "NotEaten"] as const).map((filterOpt) => (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => {
                      setMealFilter(filterOpt);
                      setCurrentPage(1);
                    }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      mealFilter === filterOpt
                        ? "bg-white text-stone-900 shadow-sm"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    {filterOpt === "All"
                      ? "All members"
                      : filterOpt === "Eaten"
                        ? "Eaten (≥1)"
                        : "Not eaten (0)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-stone-400 text-[11px]">
              Showing {totalItems} eligible{" "}
              {totalItems === 1 ? "member" : "members"}
            </div>
          </div>
        </div>

        {/* Table Column Headers (Latest meal at first: Dinner -> Lunch -> Breakfast) */}
        <div className="attendance-grid bg-stone-50/90 border-b border-stone-100 px-4 py-3 text-xs font-semibold text-stone-600">

        {/* Table Column Headers (Latest meal at first: Dinner -> Lunch -> Breakfast) */}
        <div className="attendance-grid bg-stone-50/90 border-b border-stone-100 px-4 py-3 text-xs font-semibold text-stone-600">
          <span>MEMBER</span>
          {MEALS_LATEST_FIRST.map((meal) => {
            const meta = MEAL_DETAILS[meal];
            const allChecked =
              filteredAndSortedMembers.length > 0 &&
              filteredAndSortedMembers.every((m) =>
                selected.has(`${m.id}|${meal}`),
              );
            const someChecked =
              !allChecked &&
              filteredAndSortedMembers.some((m) =>
                selected.has(`${m.id}|${meal}`),
              );

            return (
              <div
                key={meal}
                className="flex flex-col items-center justify-center"
              >
                <button
                  type="button"
                  title={`Click to ${allChecked ? "unmark" : "mark"} all for ${meal}`}
                  onClick={() => toggleAllForMeal(meal)}
                  className="group flex items-center gap-1.5 text-stone-700 hover:text-emerald-800 transition"
                >
                  <span className="font-bold tracking-tight">
                    {meta.label.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-stone-400 font-normal hidden lg:inline">
                    ({meta.badge})
                  </span>
                  <CheckCheck
                    size={13}
                    className={`transition ${
                      allChecked
                        ? "text-emerald-700"
                        : someChecked
                          ? "text-amber-600"
                          : "text-stone-300 group-hover:text-stone-500"
                    }`}
                  />
                </button>
                <span className="text-[10px] text-stone-400 font-normal mt-0.5">
                  click to toggle all
                </span>
              </div>
            );
          })}
        </div>

        {/* Member Rows */}
        {paginatedMembers.map((m, i) => {
          const eatenCount = getEatenMealsCount(m.id);
          const latestMeal =
            getLatestMealRank(m.id) === 3
              ? "Dinner"
              : getLatestMealRank(m.id) === 2
                ? "Lunch"
                : getLatestMealRank(m.id) === 1
                  ? "Breakfast"
                  : null;

          return (
            <div
              key={m.id}
              className={`attendance-grid border-b border-stone-100 px-4 py-3.5 items-center transition hover:bg-stone-50/60 ${
                eatenCount > 0 ? "bg-white" : "bg-stone-50/20"
              }`}
            >
              {/* Member Details */}
              <div className="flex items-center gap-3 pr-2">
                <span
                  className={`avatar tone-${i % 4} hidden sm:flex shrink-0`}
                >
                  {m.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-stone-900 truncate">
                      {m.name}
                    </span>
                    {latestMeal && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.2 text-[10px] font-medium text-emerald-800 border border-emerald-100 hidden sm:inline">
                        {latestMeal}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-400 truncate">
                    {eatenCount === 0
                      ? "No meals checked"
                      : `${eatenCount} of 3 meals eaten`}
                  </p>
                </div>
              </div>

              {/* Meal Checkboxes: Dinner (Latest) -> Lunch -> Breakfast */}
              {MEALS_LATEST_FIRST.map((meal) => {
                const isEaten = selected.has(`${m.id}|${meal}`);
                return (
                  <div
                    key={meal}
                    className="flex flex-col items-center justify-center py-0.5"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isEaten}
                      aria-label={`${m.name}, ${meal}: ${isEaten ? "Eaten (Checked)" : "Not eaten (Unchecked)"}`}
                      onClick={() => toggle(m.id, meal)}
                      className={`group flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 ${
                        isEaten
                          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:border-emerald-700"
                          : "border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50"
                      }`}
                    >
                      {isEaten ? (
                        <Check
                          size={20}
                          strokeWidth={2.8}
                          className="text-white"
                        />
                      ) : (
                        <span className="h-2 w-2 rounded-sm bg-transparent group-hover:bg-stone-200 transition" />
                      )}
                    </button>
                    <span
                      className={`mt-1 text-[10px] tracking-tight transition ${
                        isEaten
                          ? "font-semibold text-emerald-700"
                          : "font-normal text-stone-400"
                      }`}
                    >
                      {isEaten ? "Eaten" : "Unchecked"}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Empty State */}
        {!paginatedMembers.length && (
          <div className="empty p-10 text-center">
            <Users className="mx-auto text-stone-400" size={32} />
            <p className="mt-2 text-sm font-medium text-stone-700">
              No matching members found
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Try adjusting your search query or attendance filter.
            </p>
          </div>
        )}

        {/* Pagination Bar */}
        {totalItems > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/50 px-4 py-3 text-xs text-stone-600">
            {/* Page info & Page size selector */}
            <div className="flex items-center gap-3">
              <span>
                Showing{" "}
                <span className="font-semibold text-stone-900">
                  {totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-stone-900">
                  {Math.min(safeCurrentPage * pageSize, totalItems)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-stone-900">
                  {totalItems}
                </span>{" "}
                members
              </span>

              <div className="flex items-center gap-1.5 pl-2 border-l border-stone-200">
                <span className="text-stone-500">Per page:</span>
                <select
                  aria-label="Members per page"
                  className="rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 focus:border-emerald-600 focus:outline-none"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={9999}>All</option>
                </select>
              </div>
            </div>

            {/* Page Navigation Buttons */}
            {!isAllPages && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  title="First page"
                >
                  <ChevronsLeft size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </Button>

                {/* Page number pill buttons */}
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((pageNum) => {
                      // Show first, last, and pages adjacent to current page
                      return (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        Math.abs(pageNum - safeCurrentPage) <= 1
                      );
                    })
                    .map((pageNum, idx, arr) => {
                      const prev = arr[idx - 1];
                      const hasGap = prev && pageNum - prev > 1;

                      return (
                        <div key={pageNum} className="flex items-center gap-1">
                          {hasGap && (
                            <span className="px-1 text-stone-400 select-none">
                              …
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-semibold transition ${
                              pageNum === safeCurrentPage
                                ? "bg-emerald-800 text-white shadow-sm"
                                : "text-stone-600 hover:bg-stone-200/70"
                            }`}
                          >
                            {pageNum}
                          </button>
                        </div>
                      );
                    })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last page"
                >
                  <ChevronsRight size={14} />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Footer / Save Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 p-4 sm:p-5 bg-white">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                saved
                  ? "bg-emerald-500"
                  : dirty
                    ? "bg-amber-500 animate-pulse"
                    : "bg-stone-300"
              }`}
            />
            <span className="text-xs text-stone-500">
              {saved
                ? "Attendance saved successfully."
                : dirty
                  ? "You have unsaved changes."
                  : "Checked members share meal costs for this date."}
            </span>
          </div>

          <Button
            disabled={busy || !dirty}
            onClick={submit}
            className="font-semibold"
          >
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
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200"
        >
          {error}
        </p>
      )}

      {/* Cooking Log Prompt */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5">

      {/* Cooking Log Prompt */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5">
        <div>
          <h3 className="font-semibold text-emerald-950">
            Used oil, gas, or chai today?
          <h3 className="font-semibold text-emerald-950">
            Used oil, gas, or chai today?
          </h3>
          <p className="mt-1 text-sm text-emerald-800">
            Link purchase records used for cooked meals on {date}.
            Link purchase records used for cooked meals on {date}.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={addCooking}
          className="border-emerald-200 text-emerald-900 hover:bg-emerald-100"
        >
          Add cooking log
        </Button>
      </div>
    </div>
  );
}
