export const meals = ["Breakfast", "Lunch", "Dinner"] as const;
export type Meal = (typeof meals)[number];
export type Member = {
  id: string;
  kind: "member";
  name: string;
  phone: string;
  status: "Active" | "Left" | "Archived";
  arrival: string;
  departure: string;
  openingCredit: number;
  notes: string;
};
export type Attendance = {
  id: string;
  kind: "attendance";
  date: string;
  memberId: string;
  meal: Meal;
};
export type Food = {
  id: string;
  kind: "food";
  paidBy?: string;
  paidAt?: string;
  date: string;
  meal: Meal;
  description: string;
  amount: number;
};
export type Fuel = {
  id: string;
  kind: "fuel";
  paidBy?: string;
  date: string;
  resource: "Oil" | "Gas" | "Chai";
  amount: number;
  tier: "divide_by_people" | "average";
  memberIds: string[];
  effective: string;
  end: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  notes: string;
};
export type Cooking = {
  id: string;
  kind: "cooking";
  date: string;
  meal: Meal;
  oilId: string;
  gasId: string;
  oilRate: number;
  gasRate: number;
  chaiId?: string;
  chaiRate?: number;
};
export type Shared = {
  id: string;
  kind: "shared";
  paidBy?: string;
  date: string;
  category:
    | "Electricity"
    | "Water"
    | "Cleaning"
    | "Internet"
    | "Salary"
    | "Other";
  description: string;
  amount: number;
  method: "Equal" | "Manual" | "Excluded";
  memberIds: string[];
  manual: Record<string, number>;
};
export type Payment = {
  id: string;
  kind: "payment";
  date: string;
  memberId: string;
  type: "Deposit" | "Refund" | "Reimbursement";
  amount: number;
  method: "Cash" | "Bank" | "JazzCash" | "Easypaisa" | "Other";
  reference: string;
  notes: string;
};
export type Purchase = {
  id: string;
  kind: "purchase";
  date: string;
  memberId: string;
  description: string;
  amount: number;
  appliedTo: "General credit" | "Meal expense" | "Shared expense";
  expenseId: string;
};
export type Entity =
  | Member
  | Attendance
  | Food
  | Fuel
  | Cooking
  | Shared
  | Payment
  | Purchase;
export type Kind = Entity["kind"];
export type State = { records: Entity[]; revision: number };
export type LedgerLine = {
  id: string;
  memberId: string;
  date: string;
  category:
    | "Opening"
    | "Food"
    | "Oil"
    | "Gas"
    | "Chai"
    | "Shared"
    | "Payment"
    | "Purchase";
  description: string;
  debit: number;
  credit: number;
  balance: number;
};
export type MealSummary = {
  date: string;
  meal: Meal;
  eaters: number;
  food: number;
  oil: number;
  gas: number;
  chai: number;
  total: number;
  perEater: number;
  oilId: string;
  gasId: string;
  chaiId?: string;
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const pkr = (paisa: number) =>
  "PKR " +
  (paisa / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
export const rupees = (paisa: number) => paisa / 100;
export const byKind = <K extends Kind>(records: Entity[], kind: K) =>
  records.filter((r): r is Extract<Entity, { kind: K }> => r.kind === kind);
