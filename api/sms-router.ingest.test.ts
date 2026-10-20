/**
 * When the model that reads bank messages is switched off, out of budget or over the daily cap, the message is not
 * lost (decision 0025): the rules' reading is saved, or the raw message is kept with the reason it was not read. A
 * checked "declined" reading is never saved from the rules either. The rule parser is stubbed so these hold whatever
 * its templates say; every message is invented.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleBasedSmsResult } from "./lib/sms-rule-parser";

const state = vi.hoisted(() => ({
  rawUpdates: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
  settings: {} as Record<string, string>,
}));

vi.mock("./queries/connection", () => {
  const tableName = (table: unknown) => String((table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")] ?? "");
  const rowsFor = (name: string) =>
    name === "webhook_tokens"
      ? [{ userId: 31, userType: "local", token: "sms_test" }]
      : name === "local_users" || name === "users"
        ? [{ id: 31, plan: "free" }]
        : [];
  const chainFor = (name: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["where", "orderBy", "limit", "innerJoin", "groupBy"]) chain[method] = () => chain;
    chain.then = (resolve: (rows: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rowsFor(name)).then(resolve, reject);
    return chain;
  };
  const db = {
    select: () => ({ from: (table: unknown) => chainFor(tableName(table)) }),
    insert: () => ({ values: async () => [{ insertId: 501 }] }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.rawUpdates.push(values);
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db, getDb: () => db };
});
vi.mock("./lib/settings-cache", () => ({ getSystemSettings: async () => state.settings, invalidateSettingsCache: () => {} }));
vi.mock("./services/finance-semantic-layer", () => ({ bumpFinanceCacheGen: vi.fn(async () => {}) }));
vi.mock("./notification-engine", () => ({ checkUserBudgetExceeded: vi.fn(async () => {}) }));
vi.mock("./services/sms-ledger", async (importOriginal) => {
  const real = await importOriginal<typeof import("./services/sms-ledger")>();
  return {
    ...real,
    categorizeSms: vi.fn(async () => ({ category: "تسوق", subCategory: "عام", type: "expense" })),
    insertSmsExpense: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => {
      state.saved.push(input);
    }),
  };
});
vi.mock("./lib/sms-rule-parser", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/sms-rule-parser")>();
  return { ...real, parseSmsByRules: vi.fn() };
});
vi.mock("./lib/sms-ai-parser", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/sms-ai-parser")>();
  return { ...real, parseSmsFinancialData: vi.fn(real.parseSmsFinancialData) };
});

import { smsApp } from "./sms-router";
import { parseSmsByRules } from "./lib/sms-rule-parser";
import { parseSmsFinancialData, type SmsModelOutcome } from "./lib/sms-ai-parser";

function rules(overrides: Partial<RuleBasedSmsResult> = {}): RuleBasedSmsResult {
  return {
    transaction_detected: true,
    amount: 640,
    currency: "EGP",
    direction: "outgoing",
    provider: "Bank",
    category: "payment",
    fee: null,
    balance_after: null,
    date: null,
    reference: null,
    merchant: "SOME SHOP",
    confidence: 0.7,
    matched_rule: "test",
    ...overrides,
  };
}

let sequence = 0;
async function ingest() {
  sequence += 1;
  return smsApp.request("/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer sms_test" },
    body: JSON.stringify({ message: `تم خصم 640 جنيه من بطاقتك لدى محل رقم ${sequence}`, sender: "BANK" }),
  });
}

const lastRawUpdate = () => state.rawUpdates.at(-1) as { status: string; metadata: Record<string, unknown> };

beforeEach(() => {
  state.rawUpdates = [];
  state.saved = [];
  state.settings = {};
  vi.mocked(parseSmsByRules).mockReset();
});

describe("a bank message the model did not read is not lost", () => {
  it("with the switch off, the rules' reading is saved and no model is asked", async () => {
    state.settings = { sms_ai_enabled: "false" };
    vi.mocked(parseSmsByRules).mockReturnValue(rules());

    const res = await ingest();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ saved: true, amount: 640 });
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]).toMatchObject({ amount: 640, metadata: expect.objectContaining({ parsed_by: "rules_fallback", model_outcome: "disabled" }) });
    expect(lastRawUpdate().status).toBe("processed");
  });

  it.each(["disabled", "budget", "cost_cap", "failed", "invalid_reply"] as SmsModelOutcome[])(
    "when the model is %s and the rules found no amount, the raw message is kept with that reason",
    async (outcome) => {
      vi.mocked(parseSmsByRules).mockReturnValue(rules({ transaction_detected: false, amount: null, confidence: 0.2 }));
      vi.mocked(parseSmsFinancialData).mockResolvedValueOnce({ result: null, outcome, skipped: true });

      const res = await ingest();
      expect(await res.json()).toMatchObject({ transaction_detected: false, reason: "model_unavailable" });
      expect(state.saved).toHaveLength(0);
      expect(lastRawUpdate()).toMatchObject({ status: "ignored", metadata: expect.objectContaining({ reason: "model_unavailable", model_outcome: outcome }) });
    },
  );

  it("a checked reading of a declined payment is not saved from the rules either", async () => {
    vi.mocked(parseSmsByRules).mockReturnValue(rules());
    vi.mocked(parseSmsFinancialData).mockResolvedValueOnce({
      outcome: "not_transaction",
      skipped: false,
      result: {
        transaction_detected: false,
        amount: null,
        currency: "EGP",
        direction: null,
        provider: "Bank",
        category: "unknown",
        fee: null,
        merchant: null,
        balance_after: null,
        confidence: 0.9,
        raw_extracted: { message_kind: "declined" },
      },
    });

    const res = await ingest();
    expect(await res.json()).toMatchObject({ transaction_detected: false, reason: "not_financial" });
    expect(state.saved).toHaveLength(0);
    expect(lastRawUpdate()).toMatchObject({ status: "ignored", metadata: expect.objectContaining({ message_kind: "declined", parsed_by: "ai" }) });
  });
});
