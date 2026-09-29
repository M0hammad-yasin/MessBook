// Local-only integration suite. Requires an empty local D1 workspace and `npm run dev`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { calculate } from "../src/lib/settlement.ts";
import type { Entity, State } from "../src/lib/domain.ts";

const base = "http://localhost:3000";
const folder = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const file = readdirSync(folder).filter(
  (p) => p.endsWith(".sqlite") && p !== "metadata.sqlite",
);
assert.equal(file.length, 1, "Expected one local test database");
const db = new DatabaseSync(resolve(folder, file[0]));
db.exec("PRAGMA busy_timeout=5000");
assert.equal(
  db.prepare("SELECT count(*) AS n FROM users").get()!.n,
  0,
  "Use an empty local workspace; never run against user data",
);
assert.equal(
  db.prepare("SELECT count(*) AS n FROM records WHERE deleted=0").get()!.n,
  0,
);
const prefix = "qa-" + crypto.randomUUID();
const email = prefix + "@example.invalid";
const password = crypto.randomUUID() + "Aa1!";
const secret = readFileSync(".dev.vars", "utf8")
  .match(/^SETUP_TOKEN=(.+)$/m)![1]
  .trim();
const date = "2026-09-29";
const memberIds = [prefix + "-ali", prefix + "-yasin"];
let cookie = "";
let state: State = { records: [], revision: 0 };
let userId = "";
const seededIds: string[] = [];
let passed = 0;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  origin = base,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      ...(method !== "GET"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, data: await response.json() };
}
async function check(label: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log("PASS " + label);
}
async function save(body: Record<string, unknown>) {
  const result = await request("/api/records", "POST", {
    revision: state.revision,
    ...body,
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  state = result.data;
}
try {
  await check("unauthenticated records are protected", async () => {
    assert.equal((await request("/api/records")).response.status, 401);
  });
  await check("local setup creates a secure session", async () => {
    const r = await request("/api/auth", "POST", {
      email,
      password,
      name: "Local QA",
      setupToken: secret,
    });
    assert.equal(r.response.status, 200, JSON.stringify(r.data));
    assert.match(r.response.headers.get("set-cookie")!, /HttpOnly/i);
    cookie = r.response.headers.get("set-cookie")!.split(";")[0];
    userId = String(
      db.prepare("SELECT id FROM users WHERE email=?").get(email)!.id,
    );
  });
  const legacy = [
    ...memberIds.map((id, i) => ({
      id,
      kind: "member",
      name: i ? "Yasin" : "Ali",
      phone: "",
      status: "Active",
      arrival: "2026-09-01",
      departure: "",
      openingCredit: 0,
      notes: "",
      stayUnits: i ? 2.5 : 0.5,
    })),
    {
      id: prefix + "-shared",
      kind: "shared",
      date,
      description: "Historical water",
      category: "Water",
      amount: 60001,
      method: "Stay units",
      memberIds,
      manual: {},
    },
  ];
  for (const r of legacy) {
    db.prepare(
      "INSERT INTO records(id,kind,payload,deleted) VALUES(?,?,?,0)",
    ).run(r.id, r.kind, JSON.stringify(r));
    seededIds.push(r.id);
  }
  await check(
    "D1 migration preserves original audit payload and exact historical shares",
    async () => {
      const r = await request("/api/records");
      assert.equal(r.response.status, 200);
      state = r.data;
      assert.deepEqual(
        calculate(state.records).settlements.map((m) => m.shared),
        [10000, 50001],
      );
      assert.equal(
        "stayUnits" in state.records.find((r) => r.id === memberIds[0])!,
        false,
      );
      const revision = state.revision;
      assert.equal((await request("/api/records")).data.revision, revision);
      const audit = (await request("/api/audit")).data;
      assert.ok(
        audit.some(
          (a: { action: string; old_value: string }) =>
            a.action === "migrate" && JSON.parse(a.old_value).stayUnits === 0.5,
        ),
      );
    },
  );
  const item = {
    id: prefix + "-eggs",
    description: "Eggs",
    amount: 25000,
    paidBy: memberIds[0],
  };
  const meal = {
    date,
    meal: "Breakfast",
    items: [item],
    memberIds,
    oilId: "",
    gasId: "",
    chaiId: "",
  };
  await check("cross-origin meal writes are blocked", async () => {
    assert.equal(
      (
        await request(
          "/api/records",
          "POST",
          { revision: state.revision, meal },
          "https://untrusted.invalid",
        )
      ).response.status,
      400,
    );
  });
  await check(
    "meal, ingredients, buyer and attendance persist together",
    async () => {
      await save({ meal });
      assert.equal(calculate(state.records).mealSummaries[0].total, 25000);
      assert.equal(calculate(state.records).settlements[0].credit, 25000);
      assert.equal(
        state.records.filter((r) => r.kind === "attendance").length,
        2,
      );
      assert.deepEqual((await request("/api/records")).data, state);
    },
  );
  await check(
    "duplicate meal creation and empty attendance leave revision unchanged",
    async () => {
      const revision = state.revision;
      assert.equal(
        (await request("/api/records", "POST", { revision, meal })).response
          .status,
        400,
      );
      assert.equal(
        (
          await request("/api/records", "POST", {
            revision,
            meal: {
              ...meal,
              original: { date, meal: "Breakfast" },
              memberIds: [],
            },
          })
        ).response.status,
        400,
      );
      assert.equal((await request("/api/records")).data.revision, revision);
    },
  );
  const edit = {
    ...meal,
    original: { date, meal: "Breakfast" },
    items: [
      item,
      {
        id: prefix + "-roti",
        description: "Roti",
        amount: 50000,
        paidBy: memberIds[1],
      },
    ],
  };
  await check(
    "later ingredients and repeated saves update balances without duplicate charges",
    async () => {
      await save({ meal: edit });
      const before = calculate(state.records).settlements;
      await save({ meal: edit });
      assert.deepEqual(calculate(state.records).settlements, before);
      assert.deepEqual(
        before.map((s) => s.food),
        [37500, 37500],
      );
      assert.deepEqual(
        before.map((s) => s.credit),
        [25000, 50000],
      );
    },
  );
  await check(
    "concurrent meal edits produce one success and one conflict",
    async () => {
      const results = await Promise.all([
        request("/api/records", "POST", {
          revision: state.revision,
          meal: edit,
        }),
        request("/api/records", "POST", {
          revision: state.revision,
          meal: edit,
        }),
      ]);
      assert.deepEqual(
        results.map((r) => r.response.status).sort(),
        [200, 409],
      );
      state = (await request("/api/records")).data;
    },
  );
  await check(
    "chai purchase credits its buyer once and saves its selected rate",
    async () => {
      await save({
        upsert: [
          {
            id: prefix + "-chai",
            kind: "fuel",
            resource: "Chai",
            date,
            amount: 100000,
            paidBy: memberIds[0],
            tier: "average",
            memberIds: [],
            effective: date,
            end: "",
            breakfast: 10000,
            lunch: 0,
            dinner: 5000,
            notes: "Tea",
          },
        ],
      });
      await save({ meal: { ...edit, chaiId: prefix + "-chai" } });
      assert.equal(calculate(state.records).mealSummaries[0].chai, 10000);
      assert.deepEqual(
        calculate(state.records).settlements.map((s) => s.credit),
        [125000, 50000],
      );
    },
  );
  await check(
    "buyer transfers replace old credit and archive reverses the whole meal",
    async () => {
      await save({
        meal: {
          ...edit,
          items: [{ ...item, amount: 30000, paidBy: memberIds[1] }],
        },
      });
      assert.deepEqual(
        calculate(state.records).settlements.map((s) => s.credit),
        [100000, 30000],
      );
      await save({ meal: { ...edit, items: [], remove: true } });
      assert.equal(calculate(state.records).mealSummaries.length, 0);
      assert.deepEqual(
        calculate(state.records).settlements.map((s) => s.credit),
        [100000, 0],
      );
      const audit = (await request("/api/audit")).data;
      assert.ok(
        audit.some(
          (a: { record_id: string; action: string }) =>
            a.record_id === item.id && a.action === "archive",
        ),
      );
    },
  );
  await check("archived IDs cannot be reused", async () => {
    assert.equal(
      (
        await request("/api/records", "POST", {
          revision: state.revision,
          meal,
        })
      ).response.status,
      400,
    );
  });
  await check("logout invalidates the session", async () => {
    await request("/api/auth", "DELETE");
    assert.equal((await request("/api/records")).response.status, 401);
  });
  console.log(`${passed} local D1/API checks passed.`);
} finally {
  // Delete only fixtures created by this unique run, never pre-existing records.
  if (!userId)
    userId = String(
      db.prepare("SELECT id FROM users WHERE email=?").get(email)?.id || "",
    );
  const created = db
    .prepare(
      "SELECT DISTINCT record_id FROM audit WHERE user_id=? AND action='create'",
    )
    .all(userId)
    .map((r) => String(r.record_id));
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const id of new Set([...created, ...seededIds]))
      db.prepare("DELETE FROM records WHERE id=?").run(id);
    db.prepare("DELETE FROM audit WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM users WHERE id=? AND email=?").run(userId, email);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  db.close();
}
