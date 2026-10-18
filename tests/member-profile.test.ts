import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberProfile } from "../src/components/member-profile";
import { calculate } from "../src/lib/settlement";
import { demoRecords as buildDemo } from "../src/lib/demo";
import { pkr } from "../src/lib/domain";

// The test runner compiles JSX with the classic runtime; Next uses the automatic one.
(globalThis as { React?: unknown }).React = React;
const demoRecords = buildDemo();
const noop = () => {};
const render = (id: string, records = demoRecords) => {
  const result = calculate(records);
  const member = result.settlements.find((m) => m.id === id)!;
  return {
    result,
    member,
    html: renderToStaticMarkup(
      createElement(MemberProfile, {
        member,
        records,
        lines: result.lines,
        writable: true,
        onBack: noop,
        onSettle: noop,
        onStatement: noop,
      }),
    ),
  };
};

test("profile renders every section for each demo member without crashing", () => {
  const result = calculate(demoRecords);
  assert.ok(result.settlements.length > 0);
  for (const m of result.settlements) {
    const { html } = render(m.id);
    assert.ok(html.includes(m.name), `${m.name} name`);
    for (const heading of [
      "Balance over time",
      "Charged vs paid by month",
      "Charges against each meal",
      "Amounts paid",
    ])
      assert.ok(html.includes(heading), `${m.name}: ${heading}`);
  }
});

test("profile totals agree with the ledger", () => {
  const result = calculate(demoRecords);
  for (const m of result.settlements) {
    const own = result.lines.filter((l) => l.memberId === m.id);
    const charges = own
      .filter((l) => ["Food", "Oil", "Gas", "Chai", "Shared"].includes(l.category))
      .reduce((n, l) => n + l.debit, 0);
    const paid = own
      .filter((l) => l.credit > 0 && l.category !== "Settlement")
      .reduce((n, l) => n + l.credit, 0);
    const { html } = render(m.id);
    assert.ok(html.includes(pkr(charges)), `${m.name} charges ${pkr(charges)}`);
    assert.ok(html.includes(pkr(paid)), `${m.name} paid ${pkr(paid)}`);
    assert.ok(html.includes(pkr(Math.abs(m.balance))), `${m.name} balance`);
  }
});

test("meal charges are tagged with their meal and sum to the member's meal total", () => {
  const result = calculate(demoRecords);
  const member = result.settlements[0];
  const meal = result.lines.filter(
    (l) => l.memberId === member.id && l.meal,
  );
  assert.ok(meal.length > 0);
  assert.ok(meal.every((l) => /^(Food|Oil|Gas|Chai)$/.test(l.category)));
  // Per-meal Food lines add up to the member's Food total.
  assert.equal(
    meal.filter((l) => l.category === "Food").reduce((n, l) => n + l.debit, 0),
    member.food,
  );
});

test("profile renders in the page flow and cannot cover the sidebar menu", () => {
  const { html } = render(calculate(demoRecords).settlements[0].id);
  // A fixed/full-screen wrapper would sit on top of the fixed sidebar.
  assert.ok(!/\bfixed\b/.test(html));
});
