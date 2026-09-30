"use client";
import { Plus, Trash2 } from "lucide-react";
import { today, type Stay } from "@/lib/domain";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function StayPeriodsEditor({
  value,
  onChange,
}: {
  value: Stay[];
  onChange: (value: Stay[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Stay history</h3>
      <p className="text-xs leading-5 text-stone-500">
        Keep each arrival and departure. When this person returns, add another
        stay. Archived members still live in the house and remain eligible for
        shared bills.
      </p>
      {value.map((stay, i) => (
        <div key={stay.id} className="rounded-xl border border-stone-200 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            Stay {i + 1}
            {value.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove stay ${i + 1}`}
                onClick={() => onChange(value.filter((s) => s.id !== stay.id))}
              >
                <Trash2 size={15} />
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              Arrival
              <Input
                type="datetime-local"
                aria-label={`Stay ${i + 1} arrival`}
                required
                value={
                  stay.arrival.length === 10
                    ? stay.arrival + "T09:00"
                    : stay.arrival
                }
                onChange={(e) =>
                  onChange(
                    value.map((s) =>
                      s.id === stay.id ? { ...s, arrival: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              Departure (blank while staying)
              <Input
                type="datetime-local"
                aria-label={`Stay ${i + 1} departure`}
                value={
                  stay.departure.length === 10
                    ? stay.departure + "T18:00"
                    : stay.departure
                }
                onChange={(e) =>
                  onChange(
                    value.map((s) =>
                      s.id === stay.id
                        ? { ...s, departure: e.target.value }
                        : s,
                    ),
                  )
                }
              />
            </label>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              arrival: today() + "T09:00",
              departure: "",
            },
          ])
        }
      >
        <Plus size={16} />
        Add return / another stay
      </Button>
    </section>
  );
}
