"use client";
import { byKind, pkr, type Entity } from "@/lib/domain";
import { readMeal } from "@/lib/meal-service";
import { memberStays } from "@/lib/stays";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function RecordDetails({
  record,
  records,
  onClose,
}: {
  record: Entity;
  records: Entity[];
  onClose: () => void;
}) {
  const names = new Map(byKind(records, "member").map((m) => [m.id, m.name]));
  const meal =
    record.kind === "food" || record.kind === "cooking"
      ? readMeal(records, record.date, record.meal)
      : null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          {meal
            ? `${meal.date} · ${meal.meal}`
            : record.kind === "member"
              ? `${record.name} · stays`
              : record.kind === "payment"
                ? "Payment details"
                : "Expense details"}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-stone-500">
          Saved workspace record
        </DialogDescription>
        <div className="mt-5 space-y-4">
          {meal ? (
            <>
              <div className="space-y-2">
                {meal.items.map((i) => (
                  <div key={i.id} className="rounded-xl bg-stone-50 p-3">
                    <div className="flex justify-between gap-3 text-sm">
                      <strong>{i.description}</strong>
                      <span>{pkr(i.amount)}</span>
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      Paid by {names.get(i.paidBy) || "Mess fund"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm font-semibold">
                Ingredients total:{" "}
                {pkr(
                  meal.items.reduce((total, item) => total + item.amount, 0),
                )}
              </p>
              <p className="text-sm">
                <strong>Who ate:</strong>{" "}
                {meal.memberIds.map((id) => names.get(id)).join(", ") ||
                  "No eaters recorded"}
              </p>
            </>
          ) : record.kind === "member" ? (
            memberStays(record).map((s, i) => (
              <div key={s.id} className="rounded-xl bg-stone-50 p-3 text-sm">
                <strong>Stay {i + 1}</strong>
                <p>
                  {s.arrival.replace("T", " ")} →{" "}
                  {s.departure.replace("T", " ") || "Still staying"}
                </p>
              </div>
            ))
          ) : (
            <>
              <p>{"date" in record ? record.date : ""}</p>
              <p>
                {"description" in record
                  ? record.description
                  : record.kind === "fuel"
                    ? record.resource
                    : record.kind === "payment"
                      ? record.type
                      : ""}
              </p>
              <strong>{"amount" in record ? pkr(record.amount) : ""}</strong>
              <p className="text-sm">
                {"memberId" in record ? "Member: " : "Paid by "}
                {"paidBy" in record
                  ? names.get(record.paidBy || "") || "Mess fund"
                  : "memberId" in record
                    ? names.get(record.memberId)
                    : "—"}
              </p>
              {"notes" in record && record.notes && (
                <p className="text-sm text-stone-500">{record.notes}</p>
              )}
              {"memberIds" in record && (
                <p className="text-sm">
                  Participants:{" "}
                  {record.memberIds.map((id) => names.get(id)).join(", ") ||
                    "None"}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
