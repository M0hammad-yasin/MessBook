import type { Member, Stay } from "./domain";
export function memberStays(member: Member): Stay[] {
  return (
    member.stays ?? [
      {
        id: `initial-${member.id}`,
        arrival: member.arrival,
        departure: member.departure,
      },
    ]
  );
}
export function isResidentOn(member: Member, date: string) {
  return memberStays(member).some(
    (s) =>
      s.arrival.slice(0, 10) <= date &&
      (!s.departure || s.departure.slice(0, 10) >= date),
  );
}
export function canJoinMeal(member: Member, date: string) {
  return member.status === "Active" && isResidentOn(member, date);
}
/** Conservative defaults for bills/absence views when an old Left record has no departure. */
export function isKnownResidentOn(member: Member, date: string) {
  return memberStays(member).some(
    (stay) =>
      stay.arrival.slice(0, 10) <= date &&
      (stay.departure
        ? stay.departure.slice(0, 10) >= date
        : member.status !== "Left"),
  );
}
export function validateStays(member: Member, requireDeparture = false) {
  const stays = [...memberStays(member)].sort((a, b) =>
    a.arrival.localeCompare(b.arrival),
  );
  if (!stays.length) throw new Error("Add at least one stay period");
  if (new Set(stays.map((s) => s.id)).size !== stays.length)
    throw new Error("Duplicate stay period");
  stays.forEach((s, i) => {
    const valid = (value: string) =>
      /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(
        value,
      ) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value.slice(0, 10)).toISOString().slice(0, 10) ===
        value.slice(0, 10);
    if (!valid(s.arrival) || (s.departure && !valid(s.departure)))
      throw new Error("Enter valid stay dates");
    if (s.departure && s.departure < s.arrival)
      throw new Error("Departure must follow arrival");
    if (
      i &&
      (!stays[i - 1].departure ||
        stays[i - 1].departure.slice(0, 10) >= s.arrival.slice(0, 10))
    )
      throw new Error(
        "Stay periods cannot overlap; return must be after the previous departure day",
      );
  });
  // Legacy Left records may lack a known departure; do not invent historical dates.
  if (
    requireDeparture &&
    member.status === "Left" &&
    stays.some((s) => !s.departure)
  )
    throw new Error(
      "Close the current stay with a departure date before marking the member Left",
    );
}
