import { type Entity, meals, today } from "./domain";
export function demoRecords(): Entity[] {
  const now = today();
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));
  const records: Entity[] = [];
  const names = [
    "Ahmed Raza",
    "Bilal Khan",
    "Hamza Ali",
    "Usman Farooq",
    "Saad Hassan",
    "Ali Haider",
    "Omar Siddiqui",
    "Hassan Shah",
  ];
  names.forEach((name, i) =>
    records.push({
      id: `m${i}`,
      kind: "member",
      name,
      phone: `0300 123 450${i}`,
      qaum: "",
      status: "Active",
      arrival: `${month}-01T09:00`,
      departure: "",
      openingCredit: 0,
      notes: "",
    }),
  );
  records.push(
    {
      id: "oil1",
      kind: "fuel",
      date: `${month}-01`,
      resource: "Oil",
      amount: 780000,
      tier: "average",
      memberIds: [],
      effective: `${month}-01`,
      end: "",
      breakfast: 4500,
      lunch: 8500,
      dinner: 8500,
      notes: "Cooking oil · 10 litre tin",
    },
    {
      id: "gas1",
      paidBy: "m5",
      kind: "fuel",
      date: `${month}-01`,
      resource: "Gas",
      amount: 450000,
      tier: "average",
      memberIds: [],
      effective: `${month}-01`,
      end: "",
      breakfast: 3500,
      lunch: 5500,
      dinner: 5500,
      notes: "Kitchen cylinder · September",
    },
  );
  records.push({
    id: "chai1",
    kind: "fuel",
    date: month + "-01",
    resource: "Chai",
    amount: 300000,
    paidBy: "m1",
    tier: "average",
    memberIds: [],
    effective: month + "-01",
    end: "",
    breakfast: 9000,
    lunch: 0,
    dinner: 9000,
    notes: "Milk, tea and sugar",
  });
  for (let d = 1; d <= day; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    meals.forEach((meal, mi) => {
      if (d === day && mi === 2) return;
      names.forEach((_, i) => {
        if ((i + d + mi) % 7 !== 0)
          records.push({
            id: `a-${d}-${mi}-${i}`,
            kind: "attendance",
            date,
            meal,
            memberId: `m${i}`,
          });
      });
      records.push({
        id: `f-${d}-${mi}`,
        kind: "food",
        date,
        meal,
        description: [
          "Eggs & paratha",
          "Daal, rice & salad",
          "Chicken curry & roti",
        ][mi],
        paidBy: d % 3 === 0 ? `m${(d + mi) % 8}` : "",
        amount: [82000, 136000, 184000][mi] + (d % 4) * 6000,
      });
      records.push({
        id: `c-${d}-${mi}`,
        kind: "cooking",
        date,
        meal,
        oilId: "oil1",
        gasId: "gas1",
        chaiId: mi === 0 ? "chai1" : "",
        chaiRate: mi === 0 ? 9000 : 0,
        oilRate: mi ? 8500 : 4500,
        gasRate: mi ? 5500 : 3500,
      });
    });
  }
  records.push(
    {
      id: "shared1",
      kind: "shared",
      date: `${month}-01`,
      category: "Internet",
      description: "Monthly broadband",
      amount: 400000,
      method: "Equal",
      memberIds: names.map((_, i) => `m${i}`),
      manual: {},
    },
    {
      id: "shared2",
      kind: "shared",
      date: `${month}-01`,
      category: "Electricity",
      description: "Common area electricity",
      amount: 1260000,
      method: "Equal",
      memberIds: names.map((_, i) => `m${i}`),
      manual: {},
    },
  );
  names.forEach((_, i) =>
    records.push({
      id: `p${i}`,
      kind: "payment",
      date: `${month}-01`,
      memberId: `m${i}`,
      amount: [
        1800000, 1200000, 1500000, 2000000, 1400000, 1000000, 1800000, 1600000,
      ][i],
      type: "Deposit",
      method: i % 2 ? "Bank" : "JazzCash",
      reference: `SEP-00${i + 1}`,
      notes: "Monthly contribution",
    }),
  );
  return records;
}
