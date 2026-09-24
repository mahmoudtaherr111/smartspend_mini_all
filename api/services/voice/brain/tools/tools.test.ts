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
    getTransactionLookup: vi.fn(async (_ctx, query: string) =>
      query === "أوبر" ? { id: 9, type: "expense", amount: 85, category: "مواصلات", subCategory: "تاكسي", description: "أوبر", date: "2026-09-20" } : null),
    getWalletSummary: vi.fn(async () => ({ totalBalance: 9_000, walletCount: 1, wallets: [{ id: 1, name: "الكاش", provider: "cash", balance: 9_000 }] })),
    getClassificationTrace: vi.fn(async () => ({
      transaction: { id: 9, type: "expense", amount: 85, category: "مواصلات", subCategory: "تاكسي", description: "أوبر", date: "2026-09-20" },
      parsedBy: "rule_engine", confidence: 92,
    })),
    getCategoryInclusion: vi.fn(async () => ({
      category: "أكل", merchants: ["طلبات", "كشري التحرير"], ruleExplanation: "",
      sampleTransactions: [{ description: "طلبات", amount: 240, date: "2026-09-18" }], totalMatched: 6,
    })),
    getGoalFeasibility: vi.fn(async () => ({
      monthlyCapacity: 4_000, targetAmount: 15_000, estimatedMonths: 4, feasibilityRating: "moderate",
      topExpenseLevers: [{ category: "أكل وشرب", amount: 1_250, potentialSavings: 300 }],
    })),
  };
});

vi.mock("./reports", () => ({
  readStoredReport: vi.fn(async (_identity, month: string) =>
    month === "2026-08" ? { source: "analysis", writtenOn: "2026-09-01", points: ["صرفك على الأكل برّه زاد لحد 1500 جنيه.", "المواصلات ثابتة."] } : null),
  readPendingQuestions: vi.fn(async () => ({
    count: 2,
    items: [
      { id: 44, question: "الـ 150 يوم الخميس كانت على إيه؟", words: "150 يوم الخميس" },
      { id: 45, question: "مين حسن؟", words: "حسن 300" },
    ],
  })),
}));

vi.mock("../../../../lib/ai-gateway", () => ({ executeAiGateway: vi.fn() }));

import { executeAiGateway } from "../../../../lib/ai-gateway";
import { getFinanceTransactions } from "../../../finance-semantic-layer/resolvers";
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
      parseExpense: vi.fn(), saveExpenses: vi.fn(), deleteExpenses: vi.fn(), dismissClarification: vi.fn(), waitingEntry: vi.fn(), answerProfileQuestion: vi.fn(),
      listBudgets: vi.fn(async () => [{ title: "أكل", category: "أكل وشرب", limit: 2_000, spent: 1_250, percent: 63, exceeded: false }]),
    },
    signal: new AbortController().signal,
    now: () => new Date("2026-09-22T10:00:00Z"),
    salaryDay: async () => 25,
    openClarifications: [],
  };
});

describe("memory: getting to know the user", () => {
  it("saves an answer to the call's profile question as the Home card would, and refuses one that does not fit", async () => {
    expect((await memoryTool.run({ op: "answer", key: "salary_day", value: "خمسة وعشرين" }, ctx)).response)
      .toMatchObject({ ok: true, saved: { key: "salary_day", value: 25 } });
    expect(ctx.app.answerProfileQuestion).toHaveBeenCalledWith(ctx.identity, "salary_day", 25, false);
    expect((await memoryTool.run({ op: "answer", key: "salary_day", value: "45" }, ctx)).response).toMatchObject({ ok: false, error: "unclear_answer" });
    expect((await memoryTool.run({ op: "answer", key: "smoking", value: "لأ" }, ctx)).response).toMatchObject({ ok: false, error: "unknown_question" });
    await memoryTool.run({ op: "answer", key: "income_level", skip: true }, ctx);
    expect(ctx.app.answerProfileQuestion).toHaveBeenLastCalledWith(ctx.identity, "income_level", undefined, true);
  });
});

describe("money_query: what was already written, and why", () => {
  it("reads last month's written report with its figures, and lets the call quote it", async () => {
    const result = await moneyQuery.run({ metric: "report" }, ctx);
    expect(result.response).toMatchObject({
      ok: true,
      period: "أغسطس 2026",
      report: ["صرفك على الأكل برّه زاد لحد 1500 جنيه.", "المواصلات ثابتة."],
      from: "تحليل الشهر في التطبيق",
    });
    expect(ctx.ledger.allows(1500, false)).toBe(true);
  });

  it("reads a month still to come as this month so far", async () => {
    expect((await moneyQuery.run({ metric: "report", month: "2027-01" }, ctx)).response).toMatchObject({ period: "سبتمبر 2026" });
  });

  it("says when a month has no written report, with its figures instead", async () => {
    const result = await moneyQuery.run({ metric: "report", month: "2026-07" }, ctx);
    expect(result.response.coverage).toContain("مفيش تقرير مكتوب");
    expect(result.response.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "المصروف" })]));
  });

  it("explains how a transaction got its category", async () => {
    const result = await moneyQuery.run({ metric: "why", search: "أوبر" }, ctx);
    expect(result.response).toMatchObject({ category: "مواصلات / تاكسي", by: "قاعدة ثابتة من كلامك", facts: [{ value: 85 }] });
    expect((await moneyQuery.run({ metric: "why" }, ctx)).response).toMatchObject({ ok: false, error: "missing_search" });
  });

  it("lists what a category counts, can say whether an amount is affordable, and finds waiting questions", async () => {
    expect((await moneyQuery.run({ metric: "includes", category: "أكل" }, ctx)).response).toMatchObject({ places: ["طلبات", "كشري التحرير"], count: 6 });
    expect((await moneyQuery.run({ metric: "feasibility", amount: 15_000 }, ctx)).response).toMatchObject({ months: 4, rating: "متوسطة", cut_first: ["أكل وشرب"] });
    expect((await moneyQuery.run({ metric: "pending" }, ctx)).response).toMatchObject({ count: 2, waiting: [{ id: 44, words: "150 يوم الخميس" }, { question: "مين حسن؟" }] });
  });

  it("names what changed against the same days before, biggest first", async () => {
    const result = await moneyQuery.run({ metric: "drivers", period: "this_month" }, ctx);
    expect(result.response.ok).toBe(true);
    expect(String(result.response.period)).toContain("نفس الأيام");
  });
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

  it("breaks the spending down with each share said in words", async () => {
    const result = await moneyQuery.run({ metric: "breakdown", period: "this_month" }, ctx);
    expect(result.response).toMatchObject({
      facts: [{ label: "الإجمالي", value: 2_800 }, { label: "أكل وشرب", value: 1_250 }, { label: "مواصلات", value: 600 }],
      shares: [{ name: "أكل وشرب" }, { name: "مواصلات" }],
    });
    expect(ctx.ledger.allows(1_250, false)).toBe(true);
  });

  it("lists the latest transactions, and finds one by the words the user uses for it", async () => {
    vi.mocked(getFinanceTransactions).mockResolvedValueOnce({
      transactions: [{ id: 3, type: "expense", amount: 40, category: "transport", description: null, date: "2026-09-21" }],
      totalMatched: 1,
    } as never);
    const list = await moneyQuery.run({ metric: "transactions", period: "this_month" }, ctx);
    // A stored English key is said in Arabic.
    expect(list.response).toMatchObject({ facts: [{ label: "مواصلات", value: 40 }], total_matched: 1 });
    const found = await moneyQuery.run({ metric: "transactions", search: "أوبر" }, ctx);
    expect(found.response).toMatchObject({ facts: [{ label: "أوبر", value: 85 }], category: "مواصلات / تاكسي" });
  });

  it("gives each budget's limit and what was spent from it", async () => {
    const result = await moneyQuery.run({ metric: "budgets" }, ctx);
    expect(result.response).toMatchObject({
      facts: [{ label: "ميزانية أكل", value: 2_000 }, { label: "المصروف من ميزانية أكل", value: 1_250 }],
      used: [{ budget: "أكل", over: false }],
    });
  });

  it("gives the active goals with how long each is estimated to take", async () => {
    const result = await moneyQuery.run({ metric: "goals" }, ctx);
    expect(result.response).toMatchObject({ facts: [{ label: "هدف عربية", value: 150_000 }], months: [50] });
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
