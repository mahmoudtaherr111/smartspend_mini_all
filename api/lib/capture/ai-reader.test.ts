/**
 * Layer two of capture, the model that reads bank messages (decision 0025), against a fake OpenAI-compatible provider: the admin's `sms`
 * route answers, the prompt carries no card, phone, reference or name, one call holds one user's message, the switch,
 * the budget and the daily cap each skip the model, and a reply that fails the contract is discarded. Every message
 * here is invented; the repository is public.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  adminRoutes: { preferred: null, routes: [] } as { preferred: unknown; routes: unknown[] },
  budgetRefuses: false,
  spentTodayUsd: 0,
  rates: { input: 0.25, output: 1.5, cached: 0.0125, source: "admin" } as Record<string, unknown> | null,
  replies: [] as string[],
  requests: [] as Array<{ url: string; body: { model: string; messages: Array<{ role: string; content: string }> } }>,
}));

vi.mock("../../queries/connection", () => ({ db: {}, getDb: () => ({}) }));
vi.mock("../settings-cache", () => ({ getSystemSettings: async () => state.settings, invalidateSettingsCache: () => {} }));
vi.mock("../ai-gateway", () => ({ resolveAdminRoutes: vi.fn(async () => state.adminRoutes) }));
vi.mock("../ai-usage-policy", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai-usage-policy")>();
  return {
    ...real,
    assertAiBudget: vi.fn(async () => {
      if (state.budgetRefuses) throw new Error("budget spent");
      return { limit: 50_000, used: 0, remaining: 50_000, plan: "free", perRequestMax: 256 };
    }),
    trackAiTokens: vi.fn(async () => {}),
  };
});
vi.mock("../ai-ledger", () => ({
  recordModelCalls: vi.fn(),
  ledgerCostUsdSince: vi.fn(async () => state.spentTodayUsd),
}));
vi.mock("../ai-pricing", () => ({
  ratesFor: vi.fn(async () => state.rates),
  costAtRates: (rates: { input: number; output: number }, usage: { promptTokens: number; completionTokens: number }) =>
    (usage.promptTokens * rates.input + usage.completionTokens * rates.output) / 1_000_000,
}));
vi.mock("../llm-router", async (importOriginal) => {
  const real = await importOriginal<typeof import("../llm-router")>();
  return { ...real, executeLlmChain: vi.fn(real.executeLlmChain) };
});

import { clearAiReaderCache, condenseMessage, readMessageWithModel } from "./ai-reader";
import { assertAiBudget, trackAiTokens } from "../ai-usage-policy";
import { recordModelCalls } from "../ai-ledger";
import { executeLlmChain, resetCircuitBreakers, type LlmRoute } from "../llm-router";
import { mapModelName } from "../model-mapper";
import { SMS_PROMPT_VERSION } from "../sms-ai-contract";

const fakeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
  state.requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  const content = state.replies.shift() ?? "{}";
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 310, completion_tokens: 90, total_tokens: 400 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
vi.stubGlobal("fetch", fakeFetch);
afterAll(() => vi.unstubAllGlobals());

const ADMIN_ROUTE = {
  slug: "openrouter",
  protocol: "openai",
  baseUrl: "https://fake-provider.test/v1",
  apiKey: "sk-fake",
  model: "fake/sms-reader",
  priority: 0,
  providerId: 7,
  suppressReasoning: false,
};

const PURCHASE =
  "تم خصم مبلغ 1,250.50 جنيه من بطاقتك المنتهية ب 4821 لدى CARREFOUR الرصيد المتاح 12,340.75 جنيه";
const USER = { userId: 12, userType: "local", plan: "free", sender: "CIB", providerHint: "Bank" as const };

function reply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    is_financial: true,
    message_kind: "card_purchase",
    direction: "out",
    amount: { value: 1250.5, currency: "EGP" },
    amount_egp: null,
    fee: null,
    balance_after: 12340.75,
    counterparty: { type: "merchant", name: "CARREFOUR" },
    rail: "card",
    account_last4: "[REDACTED_CARD]",
    occurred_at: null,
    category: "food",
    sub_category: "groceries",
    subscription_hint: false,
    confidence: { kind: 0.95, amount: 0.97, direction: 0.95, category: 0.8 },
    ...overrides,
  });
}

beforeEach(() => {
  state.settings = {};
  state.adminRoutes = { preferred: ADMIN_ROUTE, routes: [ADMIN_ROUTE] };
  state.budgetRefuses = false;
  state.spentTodayUsd = 0;
  state.rates = { input: 0.25, output: 1.5, cached: 0.0125, source: "admin" };
  state.replies = [];
  state.requests = [];
  clearAiReaderCache();
  resetCircuitBreakers();
  vi.clearAllMocks();
});

describe("the admin's route reads the message", () => {
  it("sends the redacted message to the provider the admin chose for sms, and only to it", async () => {
    state.replies.push(reply());
    const read = await readMessageWithModel(PURCHASE, USER);

    expect(read.outcome).toBe("parsed");
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].url).toBe("https://fake-provider.test/v1/chat/completions");
    expect(state.requests[0].body.model).toBe("fake/sms-reader");
    expect(read.result).toMatchObject({
      transaction_detected: true,
      amount: 1250.5,
      currency: "EGP",
      direction: "outgoing",
      category: "payment",
      merchant: "CARREFOUR",
      balance_after: 12340.75,
      provider: "Bank",
    });
    // The card ending never left the server; it is filled in from the redaction.
    expect(read.result?.raw_extracted).toMatchObject({ prompt_version: SMS_PROMPT_VERSION, account_last4: "4821", category: "food" });
  });

  it("checks the plan budget on the sms channel before the call and records what the call cost after it", async () => {
    state.replies.push(reply());
    await readMessageWithModel(PURCHASE, USER);

    expect(assertAiBudget).toHaveBeenCalledWith(expect.objectContaining({ id: 12, type: "local", plan: "free" }), "sms", expect.any(Number));
    expect(recordModelCalls).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, type: "local" }),
      "sms",
      expect.arrayContaining([expect.objectContaining({ slug: "openrouter", model: "fake/sms-reader", ok: true })]),
      expect.objectContaining({ tokens: 400 }),
    );
    expect(trackAiTokens).toHaveBeenCalledWith(expect.objectContaining({ id: 12, type: "local" }), 400, "sms", "fake/sms-reader");
  });

  it("uses the server's Gemini key with the flash model while the admin has no sms route", async () => {
    state.adminRoutes = { preferred: null, routes: [] };
    const seen: LlmRoute[][] = [];
    vi.mocked(executeLlmChain).mockImplementationOnce(async (routes) => {
      seen.push(routes);
      return {
        text: reply(),
        promptTokens: 300,
        completionTokens: 80,
        cachedTokens: 0,
        totalTokens: 380,
        route: routes[0],
        latencyMs: 5,
        attempts: [{ slug: routes[0].slug, model: routes[0].model, ok: true, latencyMs: 5, promptTokens: 300, completionTokens: 80 }],
        attemptTotals: { promptTokens: 300, completionTokens: 80, cachedTokens: 0, totalTokens: 380 },
        degradedSchema: false,
      };
    });

    const read = await readMessageWithModel(PURCHASE, USER);
    expect(read.outcome).toBe("parsed");
    expect(seen[0]).toHaveLength(1);
    expect(seen[0][0]).toMatchObject({ slug: "gemini", protocol: "gemini", model: mapModelName("flash"), apiKey: "test" });
  });
});

describe("what leaves the server", () => {
  it("carries no card digits, account, phone, reference or name", async () => {
    state.replies.push(
      reply({
        message_kind: "transfer_out",
        amount: { value: 500, currency: "EGP" },
        balance_after: 2500,
        counterparty: { type: "person", name: "[REDACTED_NAME]" },
        rail: "instapay",
        category: null,
        sub_category: null,
      }),
    );
    const message =
      "تم تحويل 500 جنيه إلى محمد أحمد علي رقم 01012345678 عبر انستاباي من حسابك رقم 100234567890123 رقم مرجعي 9F3K2201 الرصيد 2500 جنيه";
    const read = await readMessageWithModel(message, { ...USER, sender: "01112223334" });

    const sent = JSON.stringify(state.requests[0].body);
    for (const secret of ["محمد", "أحمد", "01012345678", "01112223334", "100234567890123", "9F3K2201"]) {
      expect(sent).not.toContain(secret);
    }
    expect(sent).toContain("500");
    expect(sent).toContain("2500");
    expect(read.result).toMatchObject({ amount: 500, direction: "outgoing", category: "transfer", merchant: null });
  });

  it("asks once per message, and a prompt holds one user's message only", async () => {
    state.replies.push(reply(), reply({ amount: { value: 75, currency: "EGP" }, balance_after: null, counterparty: { type: "merchant", name: "TALABAT" } }));
    await readMessageWithModel(PURCHASE, USER);
    await readMessageWithModel("Your card **9910 was charged EGP 75.00 at TALABAT", { ...USER, userId: 99, userType: "oauth" });

    expect(state.requests).toHaveLength(2);
    const [first, second] = state.requests.map((request) => request.body.messages);
    expect(first.map((m) => m.role)).toEqual(["system", "user"]);
    expect(first[1].content).toContain("CARREFOUR");
    expect(first[1].content).not.toContain("TALABAT");
    expect(second[1].content).toContain("TALABAT");
    expect(second[1].content).not.toContain("CARREFOUR");
  });
});

describe("when the model must not be called, it is not", () => {
  it("the admin's switch stops it before anything is paid or sent", async () => {
    state.settings = { sms_ai_enabled: "false" };
    const read = await readMessageWithModel(PURCHASE, USER);
    expect(read).toMatchObject({ reply: null, result: null, outcome: "disabled", skipped: true });
    expect(state.requests).toHaveLength(0);
    expect(assertAiBudget).not.toHaveBeenCalled();
  });

  it("a spent plan budget skips it", async () => {
    state.budgetRefuses = true;
    const read = await readMessageWithModel(PURCHASE, USER);
    expect(read).toMatchObject({ reply: null, result: null, outcome: "budget", skipped: true });
    expect(state.requests).toHaveLength(0);
  });

  it("the daily cost cap skips it once today's spending would pass it", async () => {
    state.settings = { sms_ai_daily_cost_cap_usd: "0.50" };
    state.spentTodayUsd = 0.4999;
    const read = await readMessageWithModel(PURCHASE, USER);
    expect(read).toMatchObject({ reply: null, result: null, outcome: "cost_cap", skipped: true });
    expect(state.requests).toHaveLength(0);
  });

  it("under the cap the call goes ahead, and with a cap a model without a price is never called", async () => {
    state.settings = { sms_ai_daily_cost_cap_usd: "0.50" };
    state.spentTodayUsd = 0.1;
    state.replies.push(reply());
    expect((await readMessageWithModel(PURCHASE, USER)).outcome).toBe("parsed");

    clearAiReaderCache();
    state.rates = null;
    expect((await readMessageWithModel(PURCHASE, USER)).outcome).toBe("cost_cap");
    expect(state.requests).toHaveLength(1);
  });

  it("without a known user there is no budget to charge, so no call", async () => {
    expect((await readMessageWithModel(PURCHASE, {})).outcome).toBe("no_user");
    expect(state.requests).toHaveLength(0);
  });
});

// The checks themselves are in api/lib/sms-ai-contract.test.ts; here, what the model path does with their verdict.
describe("what the model path does with the contract's verdict", () => {
  it("a discarded reply is no answer", async () => {
    state.replies.push(reply({ amount: { value: 1300, currency: "EGP" } }));
    expect(await readMessageWithModel(PURCHASE, USER)).toMatchObject({ reply: null, result: null, outcome: "invalid_reply", skipped: true });
  });

  it("a declined payment is an answer that saves nothing", async () => {
    state.replies.push(reply({ message_kind: "declined" }));
    const read = await readMessageWithModel(PURCHASE, USER);
    expect(read.outcome).toBe("not_transaction");
    expect(read.result?.transaction_detected).toBe(false);
  });

  it("a foreign amount without its EGP equivalent is not used", async () => {
    state.replies.push(
      reply({ message_kind: "international_purchase", amount: { value: 20, currency: "USD" }, balance_after: null, counterparty: { type: "merchant", name: "OPENAI" } }),
    );
    const read = await readMessageWithModel("Card **2201 used for USD 20.00 at OPENAI *CHATGPT SUBSCR", USER);
    expect(read).toMatchObject({ result: null, outcome: "needs_review", skipped: true, reply: { amount: { value: 20, currency: "USD" } } });
  });
});

describe("what the model is shown", () => {
  // Shapes of real bank and wallet messages; every number and name is invented.
  const samples = [
    "عزيزي العميل، تم خصم مبلغ 1,250.50 جم من بطاقتك الائتمانية المنتهية بـ **4321 لدى ZARA Cairo Festival بتاريخ 2026-08-20. الرصيد المتاح هو 15,400.00 جم. لخدمة العملاء اتصل بـ 19666. تطبق الشروط والأحكام. البنك لن يطلب منك رقمك السري أبداً.",
    "عميلنا العزيز: تم سحب نقدي بمبلغ 3000 جنيه من ماكينة الصراف الآلي NBE ATM - Nasr City بالبطاقة **9876 بتاريخ 25/08/2026 الساعة 14:30. الرصيد المتبقي: 8,500.00 جنيه. للاستفسار اتصل على 19623 أو زور موقعنا www.nbe.com.eg.",
    "Dear Valued Customer, your QNB credit card *1122 was debited by EGP 450.00 at Buffalo Burger on 24-08-2026. Avail Bal: EGP 12,300.50. For 24/7 support call 19700. Enjoy special offers at https://qnb.com.eg.",
    "تم تحويل مبلغ 500 جنيه بنجاح لرقم 01012345678. مصاريف الخدمة 1 جنيه. رصيدك الحالي هو 1250.00 جنيه. كود العملية 9823412. وفر أكتر مع عروض فودافون كاش وحمل تطبيق أنا فودافون.",
    "تم تحويل 2,000.00 جم بنجاح إلى حساب أحمد محمد عبر انستاباي InstaPay من حسابك بالبنك الأهلي. الرقم المرجعي: IP993214. الرصيد المتاح 18,000.00 جم. تنبيه أمني: لا تشارك بياناتك السرية مع أي شخص.",
  ];

  it.each(samples)("drops greetings, hotlines, links and sign-offs, and keeps every amount and card: %#", (raw) => {
    const condensed = condenseMessage(raw);
    expect(condensed.length).toBeLessThan(raw.length);
    expect(condensed).not.toMatch(/19\d{3}/);
    expect(condensed).not.toMatch(/https?:\/\/|www\./);
    expect(condensed).not.toMatch(/عزيزي العميل|عميلنا العزيز|Dear Valued Customer/i);
    expect(condensed).not.toMatch(/تطبق الشروط|thank you for/i);
    for (const number of raw.match(/\d[\d,.]*\d|\d/g) ?? []) {
      if (/^19\d{3}$/.test(number)) continue; // a hotline
      expect(condensed).toContain(number);
    }
  });
});