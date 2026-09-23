import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../finance-semantic-layer/resolvers", () => {
  const period = (label: string, daysElapsed = 10, daysTotal = 30) => ({
    kind: "custom", key: label, label, startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-30T00:00:00Z"),
    salaryDay: 25, daysElapsed, daysTotal, isSalaryCycle: true,
  });
  const summary = (expense: number, count = 5, income = 0) => ({
    period: period("p"), totalIncome: income, totalExpense: expense, totalTransfers: 0, totalInvestments: 0,
    netFlow: income - expense, transactionCount: count, expenseCount: count, incomeCount: 0, dailyAverageExpense: expense / 10,
  });
  return {
    getFinanceSummary: vi.fn(async (_ctx, input: { period?: string; startDate?: string }) =>
      input.period === "today" ? { ...summary(320, 3), period: period("p", 1, 1) } : input.startDate ? summary(2_200, 12) : summary(2_800, 15, 14_000)),
    getCategoryTotal: vi.fn(async () => ({ period: period("p"), category: "أكل", aliases: [], totalExpense: 1_250, totalIncome: 0, transactionCount: 6, topSubCategories: [] })),
    getFinanceBreakdown: vi.fn(async () => ({
      period: period("p"), granularity: "category", totalExpense: 2_800,
      items: [{ name: "أكل وشرب", amount: 1_250, count: 6, percent: 45 }, { name: "مواصلات", amount: 600, count: 9, percent: 21 }],
    })),
    getFinanceTransactions: vi.fn(async () => ({ period: period("p"), totalMatched: 0, returned: 0, transactions: [] })),
    getGoalProgress: vi.fn(async () => ({ goals: [{ id: 1, title: "عربية", status: "active", targetAmount: 150_000, estimatedMonthlyCapacity: 3_000, estimatedMonthsNeeded: 50 }] })),
    getPersonTotal: vi.fn(async () => null),
    getTransactionLookup: vi.fn(async () => null),
    getWalletSummary: vi.fn(async () => ({ totalBalance: 9_000, walletCount: 1, wallets: [{ id: 1, name: "الكاش", provider: "cash", balance: 9_000 }] })),
  };
});

vi.mock("../../../../lib/ai-gateway", () => ({ executeAiGateway: vi.fn() }));

import { executeAiGateway } from "../../../../lib/ai-gateway";
import { DraftBook } from "../drafts";
import { FactLedger } from "../facts";
import { honorificFor } from "../honorific";
import { buildInstruction, openingNote } from "../instructions";
import { appHelpTool } from "./app-help";
import { memoryTool } from "./memory";
import { moneyQuery, periodFor } from "./money-query";
import { derivable, thinkTool } from "./think";
import type { ToolContext } from "./types";

let ctx: ToolContext;

beforeEach(() => {
  ctx = {
    identity: { callId: "vc_tools000000000", userId: 7, userType: "local", plan: "pro", role: "user" },
    ledger: new FactLedger(),
    drafts: new DraftBook(),
    app: {
      parseExpense: vi.fn(), saveExpenses: vi.fn(), deleteExpenses: vi.fn(), dismissClarification: vi.fn(),
      listBudgets: vi.fn(async () => [{ title: "أكل", category: "أكل وشرب", limit: 2_000, spent: 1_250, percent: 63, exceeded: false }]),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-09-22T10:00:00Z"),
    salaryDay: async () => 25,
    openClarifications: [],
  };
});

describe("money_query", () => {
  it("answers a total with the Egyptian way to say it, and lets the call say it", async () => {
    const result = await moneyQuery.run({ metric: "total", period: "today" }, ctx);
    expect(result.response).toMatchObject({ ok: true, period: "النهارده", facts: [{ label: "مصروف النهارده", value: 320, say: "تلتمية وعشرين" }] });
    expect(result.card).toMatchObject({ kind: "fact", items: [{ value: 320 }] });
    expect(ctx.ledger.allows(320, false)).toBe(true);
  });

  it("compares this cycle with the same number of days of the last one", async () => {
    const result = await moneyQuery.run({ metric: "compare", period: "this_month" }, ctx);
    expect(result.response).toMatchObject({
      facts: [{ value: 2_800 }, { value: 2_200 }, { label: "الفرق", value: 600, say: "ستمية" }],
      direction: "more",
    });
    expect(String((result.response.facts as Array<{ label: string }>)[1].label)).toContain("نفس الأيام");
  });

  it("says wallet balances are what the app recorded, not a live statement", async () => {
    const result = await moneyQuery.run({ metric: "balance" }, ctx);
    expect(result.response).toMatchObject({
      facts: [{ label: "إجمالي الأرصدة", value: 9_000, say: "تسع آلاف" }, { label: "الكاش", value: 9_000 }],
      coverage: expect.stringContaining("مش كشف حساب"),
    });
  });

  it("maps the model's periods to Cairo calendar ranges", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    expect(periodFor("last_year", {}, now).input).toEqual({ period: "custom", startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(periodFor("last_90_days", {}, now).input).toEqual({ period: "custom", startDate: "2026-06-25", endDate: "2026-09-22" });
    expect(periodFor("custom", { from: "2026-03-01", to: "2026-03-30" }, now).input).toMatchObject({ startDate: "2026-03-01", endDate: "2026-03-30" });
  });
});

describe("think", () => {
  it("keeps only numbers from the data, what the user said, or one step of arithmetic on them", () => {
    const allowed = derivable([9_000, 4_500, 3]);
    expect(allowed(4_500)).toBe(true);
    expect(allowed(13_500)).toBe(true);
    expect(allowed(1_500)).toBe(true);
    expect(allowed(7_777)).toBe(false);
  });

  it("drops an invented number and the reason that carries it", async () => {
    ctx.drafts.heardUser("معايا تسعة آلاف في الحساب");
    vi.mocked(executeAiGateway).mockResolvedValueOnce({
      text: JSON.stringify({
        verdict: "رأيي تستنى للمرتب",
        reasons: ["الفاضل بعد المصروف 6200 بس", "هتحتاج 7777 للإيجار"],
        numbers: [{ label: "الفاضل", value: 6_200 }, { label: "الإيجار", value: 7_777 }],
        alternative: "موديل أرخص",
        missing: null,
      }),
    } as never);
    const result = await thinkTool.run({ question: "أقدر أشتري موبايل بخمستاشر ألف؟" }, ctx);
    expect(result.response).toMatchObject({ ok: true, verdict: "رأيي تستنى للمرتب", numbers: [{ label: "الفاضل" }] });
    expect(result.response.numbers).toHaveLength(1);
    expect(result.response.reasons).toEqual(["الفاضل بعد المصروف ست آلاف وميتين بس"]);
    expect(ctx.ledger.allows(6_200, false)).toBe(true);
  });
});

describe("app_help", () => {
  it("returns the guide's steps and a screen to open", async () => {
    const result = await appHelpTool.run({ question: "إزاي أربط رسايل البنك SMS" }, ctx);
    expect(result.response).toMatchObject({ ok: true, found: true });
    expect(result.card).toMatchObject({ kind: "guide", route: "/bank-sync" });
  });

  it("says when the guide has nothing, instead of inventing steps", async () => {
    const result = await appHelpTool.run({ question: "zzqx ممكن تعملي بيتزا" }, ctx);
    expect(result.response).toMatchObject({ ok: true, found: false });
    expect(result.card).toBeUndefined();
  });
});

describe("memory", () => {
  it("never keeps age or gender", async () => {
    expect((await memoryTool.run({ op: "remember", fact: "أنا عندي 45 سنة" }, ctx)).response).toMatchObject({ ok: false, error: "not_kept" });
    expect((await memoryTool.run({ op: "remember", fact: "انا ست بيت" }, ctx)).response).toMatchObject({ ok: false, error: "not_kept" });
  });
});

describe("instructions", () => {
  it("stay short: they are billed again on every turn", () => {
    const instruction = buildInstruction({ snapshot: { firstName: null, title: null, text: "" }, voiceGender: "female" });
    // About 1,200 tokens of mostly English text.
    expect(instruction.length).toBeLessThan(5_200);
    expect(instruction).toContain("EGYPTIAN ARABIC");
    expect(instruction).toContain("أنا فاهمة");
  });

  it("use the profile's title, never an invented one", () => {
    expect(buildInstruction({ snapshot: { firstName: "منى", title: "دكتورة", text: "" }, voiceGender: "male" })).toContain("يا دكتورة");
    expect(buildInstruction({ snapshot: { firstName: null, title: null, text: "" }, voiceGender: "male" })).toContain("Do not invent a title");
  });

  it("open a new call without numbers, and continue a dropped one without greeting again", () => {
    expect(openingNote(false, [])).toContain("من غير أرقام");
    expect(openingNote(true, [{ role: "user", text: "صرفت كام" }])).toContain("من غير تحية جديدة");
  });
});

describe("honorificFor", () => {
  it("takes the title, and its gender, from the profession as written", () => {
    expect(honorificFor("دكتورة أسنان")).toBe("دكتورة");
    expect(honorificFor("طبيب")).toBe("دكتور");
    expect(honorificFor("مهندس برمجيات")).toBe("باشمهندس");
    expect(honorificFor("محامية")).toBe("أستاذة");
    expect(honorificFor("سواق")).toBeNull();
    expect(honorificFor(null)).toBeNull();
  });
});
