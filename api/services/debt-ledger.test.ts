import { describe, expect, it } from "vitest";
import { debtBalances, type LoanRow } from "./debt-ledger";

const row = (amount: number, direction: string, name: string, day = 1): LoanRow => ({
  amount, direction, contactId: null, contactName: name, description: null, date: new Date(Date.UTC(2026, 8, day)),
});

describe("ليك وعليك", () => {
  it("nets what went out against what came back, per person", () => {
    const balances = debtBalances([
      row(500, "outgoing", "احمد"), // سلفت احمد 500
      row(200, "incoming", "احمد", 5), // احمد رجعلي 200
      row(1000, "incoming", "خالي"), // استلفت من خالي 1000
      row(400, "outgoing", "خالي", 7), // رجعت لخالي 400
    ]);
    expect(balances.map((b) => [b.name, b.balance])).toEqual([["خالي", -600], ["احمد", 300]]);
  });

  it("leaves settled people and rows without a direction out", () => {
    expect(debtBalances([row(300, "outgoing", "محمد"), row(300, "incoming", "محمد"), row(50, "", "سارة")])).toEqual([]);
  });
});

describe("the gam3eya", () => {
  it("counts installments paid in and payouts taken out", async () => {
    const { gam3eyaStanding } = await import("./debt-ledger");
    expect(gam3eyaStanding([
      { amount: 1000, direction: "outgoing" },
      { amount: 1000, direction: "outgoing" },
      { amount: 10000, direction: "incoming" },
    ])).toEqual({ paid: 2000, received: 10000, held: -8000, installments: 2 });
  });
});
