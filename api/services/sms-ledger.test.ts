import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as unknown[],
    claimed: 1,
    inserted: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("../queries/connection", () => {
  const selectChain: Record<string, unknown> = {};
  const self = () => selectChain;
  Object.assign(selectChain, { from: self, where: self, limit: async () => state.rows });
  const tx = {
    update: () => ({ set: () => ({ where: async () => [{ affectedRows: state.claimed }] }) }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        state.inserted.push(values);
        return [{ insertId: 77 }];
      },
    }),
  };
  return {
    db: {
      select: self,
      update: tx.update,
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("./expense-rollups", () => ({
  applyExpenseRollupDelta: async () => undefined,
  expenseToRollupDelta: () => ({}),
  ledgerAmount: (type: string, direction: string | null | undefined, amount: number) =>
    type === "expense" && direction === "incoming" ? -Math.abs(amount) : Math.abs(amount),
}));

import {
  buildSmsSuggestion,
  categorizeSms,
  classifySmsMerchant,
  confirmSmsSuggestion,
  type SmsSuggestion,
} from "./sms-ledger";
import type { SmsParseResult } from "../lib/sms-ai-parser";

function parsed(overrides: Partial<SmsParseResult>): SmsParseResult {
  return {
    transaction_detected: true,
    amount: 250,
    currency: "EGP",
    direction: "outgoing",
    provider: "Bank",
    category: "payment",
    fee: null,
    merchant: null,
    balance_after: null,
    confidence: 0.9,
    raw_extracted: {},
    ...overrides,
  };
}

describe("where a bank message is filed", () => {
  it("files a card payment under the merchant's category when the engine knows it", async () => {
    expect(await classifySmsMerchant("UBER *TRIP")).toEqual({ category: "مواصلات", subCategory: "أوبر/كريم" });
    expect((await classifySmsMerchant("Talabat"))?.category).toBe("أكل وشرب");
    expect((await categorizeSms(parsed({ merchant: "UBER *TRIP" }))).category).toBe("مواصلات");
  });

  it("keeps the fixed map for a merchant it does not know", async () => {
    expect(await classifySmsMerchant("XYZ TRADING")).toBeNull();
    expect(await categorizeSms(parsed({ merchant: "XYZ TRADING" }))).toEqual({
      category: "تسوق",
      subCategory: "عام",
      type: "expense",
    });
  });

  it("files a withdrawal as money moved", async () => {
    expect(await categorizeSms(parsed({ category: "withdrawal" }))).toEqual({
      category: "تحويل",
      subCategory: "سحب ATM",
      type: "transfer",
    });
  });
});

describe("a message over the monthly limit", () => {
  it("is kept as a suggestion with its amount, category and time", async () => {
    const suggestion = await buildSmsSuggestion(parsed({ direction: "incoming", category: "income", amount: 9000 }), {
      sender: "NBE",
      timestamp: "2026-09-20T10:00:00Z",
    });
    expect(suggestion).toMatchObject({
      amount: 9000,
      type: "income",
      category: "مرتب",
      date: "2026-09-20T10:00:00.000Z",
    });
    expect(suggestion?.description).toContain("NBE");
  });

  it("is not kept when it holds no transaction", async () => {
    expect(await buildSmsSuggestion(parsed({ transaction_detected: false }), {})).toBeNull();
    expect(await buildSmsSuggestion(parsed({ amount: null }), {})).toBeNull();
  });
});

describe("confirming a suggestion", () => {
  const suggestion: SmsSuggestion = {
    amount: 120,
    currency: "EGP",
    direction: "outgoing",
    type: "expense",
    category: "تسوق",
    subCategory: "عام",
    provider: "Bank",
    merchant: "XYZ",
    description: "Bank — XYZ",
    date: "2026-09-20T10:00:00.000Z",
    confidence: 0.9,
  };

  beforeEach(() => {
    state.rows = [{ id: 5, message: "Purchase 120 EGP at XYZ", metadata: { suggestion } }];
    state.claimed = 1;
    state.inserted = [];
  });

  it("saves it once, with the category the user picked", async () => {
    const id = await confirmSmsSuggestion({
      id: 5,
      userId: 1,
      userType: "local",
      category: { category: "أكل وشرب", subCategory: "عام", type: "expense" },
    });
    expect(id).toBe(77);
    expect(state.inserted[0]).toMatchObject({ amount: "120", category: "أكل وشرب", source: "sms" });
  });

  it("saves nothing when the suggestion was already answered", async () => {
    state.claimed = 0;
    expect(await confirmSmsSuggestion({ id: 5, userId: 1, userType: "local" })).toBeNull();
    expect(state.inserted).toHaveLength(0);
  });

  it("saves nothing for a suggestion that is not the user's or not waiting", async () => {
    state.rows = [];
    expect(await confirmSmsSuggestion({ id: 5, userId: 2, userType: "local" })).toBeNull();
  });
});

describe("a refund in a bank message", () => {
  it("is told apart from money received", async () => {
    const { readsAsSmsRefund } = await import("./sms-ledger");
    expect(readsAsSmsRefund("Refund of EGP 250.00 from UBER to your card ending 1234")).toBe(true);
    expect(readsAsSmsRefund("تم رد مبلغ 250 جنيه من طلبات الى بطاقتك")).toBe(true);
    expect(readsAsSmsRefund("تم إيداع 5000 جنيه في حسابك")).toBe(false);
  });

  it("goes back to a known merchant's category as spending", async () => {
    const { categorizeSms } = await import("./sms-ledger");
    const result = {
      transaction_detected: true, amount: 250, currency: "EGP", direction: "incoming" as const,
      provider: "CIB" as const, category: "payment" as const, fee: null, merchant: "UBER",
      balance_after: null, confidence: 0.9,
    };
    const filed = await categorizeSms(result as never, "Refund of EGP 250.00 from UBER");
    expect(filed).toMatchObject({ category: "مواصلات", type: "expense" });
  });
});
