import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ accepted: [] as unknown[], reminders: [] as unknown[], settled: [] as unknown[], cashflows: [] as unknown[] }));
vi.mock("../../../coach/cashflows", () => ({
  CASHFLOW_KINDS: ["rent", "bill", "subscription", "school", "installment", "debt", "gam3eya", "salary", "freelance", "other"],
  position: vi.fn(async () => ({
    today: "2026-09-15", until: "2026-09-25", untilIsPayday: true, days: 10,
    wallets: { total: 8_300, count: 2, oldestObservedDay: "2026-09-01", unknownAge: 1 },
    duesKnown: 350, duesUnknownAmount: [{ title: "مدرسة" }], duesUnconfirmed: [{ title: "إيجار", dueDay: "2026-09-01" }],
    undated: [{ title: "كهربا", amount: 400, direction: "out" }],
    incomeConfirmed: 1_500, incomeEstimated: 3_000, freeBeforeIncome: 7_950, freeWithConfirmedIncome: 9_450,
    occurrences: [{ cashflowId: 2, title: "نت", dueDay: "2026-09-20", remaining: 350, status: "due" }],
  })),
  createCashflow: vi.fn(async (_user, input) => { calls.cashflows.push(input); return { id: 5 }; }),
  settle: vi.fn(async (_user, input) => { calls.settled.push(input); return { id: 1, amount: 350 }; }),
}));
vi.mock("../../../coach/plans", () => ({
  STEP_KINDS: ["spending_limit", "save", "pay", "record", "review", "other"],
  activePlan: vi.fn(async () => ({
    id: 3, title: "لحد القبض", goal: "من غير سلف", status: "active", revision: 1, reviewDay: "2026-09-22",
    acceptedAt: "2026-09-10T09:00:00.000Z", evidence: [],
    steps: [{ id: 31, title: "الأكل برّه ميتين في اليوم", kind: "spending_limit", target: { amountPerDay: 200, category: "أكل وشرب" }, status: "pending", dueDay: null, doneAt: null, doneEvidence: null, remindAt: null, reminderStatus: "none" }],
  })),
  acceptPlan: vi.fn(async (_user, input) => { calls.accepted.push(input); return { id: 4, replaced: 3 }; }),
  setStepStatus: vi.fn(async () => undefined),
  setReminder: vi.fn(async (_user, stepId, at) => { calls.reminders.push({ stepId, at }); return { revision: 1 }; }),
  cancelReminder: vi.fn(async () => undefined),
}));
vi.mock("../../../finance-semantic-layer/resolvers", () => ({
  getCategoryTotal: vi.fn(async () => ({ totalExpense: 1_500, totalIncome: 0, transactionCount: 6 })),
  // Six days of the plan's six have records: the rest are days with nothing recorded.
  getFinanceBreakdown: vi.fn(async () => ({ items: [{ name: "2026-09-10", amount: 300, count: 2 }, { name: "2026-09-12", amount: 200, count: 1 }, { name: "2026-09-14", amount: 90, count: 1 }] })),
}));
vi.mock("../../../finance-semantic-layer/cache", () => ({ getFinanceCacheGen: vi.fn(async () => 1) }));
// Unit tests run without MySQL (CI has none): the waiting classifier questions come from here, empty.
vi.mock("./reports", async (original) => ({
  ...(await original<typeof import("./reports")>()),
  readPendingQuestions: vi.fn(async () => ({ count: 0, items: [] })),
  readStoredReport: vi.fn(async () => null),
}));

import { DraftBook } from "../drafts";
import { FactLedger } from "../facts";
import { moneyQueryCoach, moneyQuery } from "./money-query";
import { changeDraftCoachTool, changeDraftTool, confirmTool } from "./record";
import type { ToolContext, VoiceAppCalls } from "./types";

let ctx: ToolContext;
const clock = { now: new Date("2026-09-15T10:00:00Z").getTime() };

beforeEach(() => {
  calls.accepted = [];
  calls.reminders = [];
  calls.settled = [];
  calls.cashflows = [];
  clock.now = new Date("2026-09-15T10:00:00Z").getTime();
  ctx = {
    identity: { callId: "vc_coachtool0000", userId: 7, userType: "local", plan: "pro", role: "user" },
    ledger: new FactLedger(),
    drafts: new DraftBook(() => clock.now),
    app: {} as VoiceAppCalls,
    signal: new AbortController().signal,
    now: () => new Date(clock.now),
    salaryDay: async () => 25,
    openClarifications: [],
    coach: true,
  };
});

describe("the coach's follow-up reads", () => {
  it("gives what is free until payday with every unknown said, and income that may come kept apart", async () => {
    const result = await moneyQueryCoach.run({ metric: "commitments" }, ctx);
    expect(result.response).toMatchObject({ ok: true, until: "2026-09-25" });
    const labels = (result.response.facts as Array<{ label: string; value: number }>).map((fact) => [fact.label, fact.value]);
    expect(labels).toContainEqual(["الفاضل بعد الالتزامات لحد القبض (من غير أي دخل جاي)", 7_950]);
    expect(labels).toContainEqual(["دخل متوقع مش مؤكد", 3_000]);
    const coverage = String(result.response.coverage);
    for (const said of ["مدرسة", "إيجار (2026-09-01)", "كهربا", "مش معروف اتسجل امتى", "من يوم 2026-09-01", "«لو وصل»"]) expect(coverage).toContain(said);
  });

  it("measures a spending step from the day it was agreed, and says days with nothing recorded are not proof", async () => {
    const result = await moneyQueryCoach.run({ metric: "plan" }, ctx);
    const facts = result.response.facts as Array<{ label: string; value: number }>;
    // 1,500 over the six days since 10 September.
    expect(facts.map((fact) => fact.value)).toEqual([200, 250]);
    expect(result.response).toMatchObject({ days_without_records: 3 });
    expect(String(result.response.coverage)).toContain("ممكن ماتسجلش");
  });

  it("is refused in the standard call", async () => {
    expect((await moneyQuery.run({ metric: "plan" }, { ...ctx, coach: false })).response).toMatchObject({ ok: false, error: "not_available" });
    expect((await changeDraftTool.run({ action: "plan_save", fields: {} }, { ...ctx, coach: false })).response).toMatchObject({ error: "not_by_voice" });
  });
});

describe("the coach's drafts", () => {
  it("saves an agreed plan only with amounts the call computed or heard, after the user's yes", async () => {
    const refused = await changeDraftCoachTool.run({ action: "plan_save", fields: { title: "لحد القبض", steps: [{ title: "الأكل", kind: "spending_limit", amount_per_day: 180 }] } }, ctx);
    expect(refused.response).toMatchObject({ ok: false, say: expect.stringContaining("مش من الحسبة") });

    ctx.ledger.nextBatch();
    const daily = ctx.ledger.add({ id: "calc_daily", label: "المتاح في اليوم", value: 180, source: "computed", unit: "EGP/day" });
    const drafted = await changeDraftCoachTool.run({
      action: "plan_save",
      fields: { title: "لحد القبض", goal: "من غير سلف", steps: [{ title: "الأكل برّه", kind: "spending_limit", amount_per_day: 180, category: "أكل وشرب" }], evidence_refs: [daily.ref] },
    }, ctx);
    expect(drafted.card).toMatchObject({ kind: "draft", title: "خطة: لحد القبض", items: [{ label: "الأكل برّه", amount: 180 }] });
    expect(calls.accepted).toEqual([]);

    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("آه احفظها");
    const done = await confirmTool.run({ draft_id: drafted.response.draft_id }, ctx);
    expect(done.response).toMatchObject({ ok: true, done: "اتحفظت الخطة الجديدة مكان القديمة" });
    expect(calls.accepted[0]).toMatchObject({ source: "voice", evidence: [{ label: "المتاح في اليوم", value: 180 }], steps: [{ target: { amountPerDay: 180, category: "أكل وشرب" } }] });
  });

  it("sets a reminder only in the future, at Cairo's hour, and only once confirmed", async () => {
    expect((await changeDraftCoachTool.run({ action: "reminder_set", fields: { step_id: 31, at: "2026-09-14T09:00" } }, ctx)).response)
      .toMatchObject({ ok: false });
    const drafted = await changeDraftCoachTool.run({ action: "reminder_set", fields: { step_id: 31, at: "2026-09-16T09:00", title: "الأكل" } }, ctx);
    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("تمام");
    await confirmTool.run({ draft_id: drafted.response.draft_id }, ctx);
    // 09:00 in Cairo (UTC+3 in September) is 06:00 UTC.
    expect(calls.reminders).toEqual([{ stepId: 31, at: new Date("2026-09-16T06:00:00.000Z") }]);
  });

  it("adds a commitment with the amount the user said and no invented date", async () => {
    ctx.ledger.noteUserValue(2_500);
    const drafted = await changeDraftCoachTool.run({
      action: "commitment_add", fields: { kind: "school", direction: "out", title: "مصاريف المدرسة", amount: 2_500, recurrence: "once" },
    }, ctx);
    expect(drafted.card).toMatchObject({ items: [{ amount: 2_500, detail: "الميعاد مش معروف" }] });
    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("آه");
    await confirmTool.run({ draft_id: drafted.response.draft_id }, ctx);
    expect(calls.cashflows[0]).toMatchObject({ amount: 2_500, startDay: null, source: "voice" });
  });

  it("changes a budget's limit to what the user said, or pauses and resumes it, only after consent", async () => {
    const changes: unknown[] = [];
    ctx.app = {
      ...ctx.app,
      listBudgets: async () => [
        { id: 12, status: "active", title: "أكل", category: "أكل وشرب", limit: 2_000, spent: 1_250, percent: 63, exceeded: false },
        { id: 13, status: "paused", title: "خروجات", category: "ترفيه", limit: 800, spent: 0, percent: 0, exceeded: false },
      ],
      updateBudget: async (_identity: unknown, id: number, change: unknown) => { changes.push({ id, change }); },
    } as never;
    const budgets = await moneyQueryCoach.run({ metric: "budgets" }, ctx);
    expect(budgets.response).toMatchObject({ used: [{ budget: "أكل", budget_id: 12 }], paused: [{ budget: "خروجات", budget_id: 13 }] });
    // An amount nobody said is refused; one the user said is drafted.
    expect((await changeDraftCoachTool.run({ action: "budget_update", fields: { budget_id: 12, limit: 1_700 } }, ctx)).response).toMatchObject({ ok: false });
    ctx.ledger.noteUserValue(1_500);
    const drafted = await changeDraftCoachTool.run({ action: "budget_update", fields: { budget_id: 12, limit: 1_500, title: "أكل" } }, ctx);
    expect(drafted.card).toMatchObject({ title: "تعديل حد الميزانية", items: [{ label: "أكل", amount: 1_500 }] });
    expect(changes).toEqual([]);
    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("آه");
    expect((await confirmTool.run({ draft_id: drafted.response.draft_id }, ctx)).response).toMatchObject({ ok: true, done: "حد الميزانية بقى ألف وخمسمية في الشهر" });
    const resume = await changeDraftCoachTool.run({ action: "budget_update", fields: { budget_id: 13, paused: false, title: "خروجات" } }, ctx);
    expect(resume.card).toMatchObject({ title: "تشغيل ميزانية تاني" });
    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("أيوه رجعها");
    await confirmTool.run({ draft_id: resume.response.draft_id }, ctx);
    expect(changes).toEqual([{ id: 12, change: { monthlyLimit: 1_500 } }, { id: 13, change: { status: "active" } }]);
  });

  it("confirms a waiting bank message as it is, once, and says so when it was already handled", async () => {
    const confirmed: number[] = [];
    ctx.app = {
      ...ctx.app,
      bankSuggestions: async () => [{ id: 81, amount: 450, type: "expense", direction: "outgoing", category: "أكل وشرب", what: "طلبات", day: "2026-09-14" }],
      confirmBankSuggestion: async (_identity: unknown, id: number) => { confirmed.push(id); return confirmed.length === 1; },
      dismissBankSuggestion: async () => true,
    } as never;
    const pending = await moneyQueryCoach.run({ metric: "pending" }, ctx);
    expect(pending.response).toMatchObject({ bank_count: 1, bank_waiting: [{ bank_id: 81, what: "طلبات", say: "ربعمية وخمسين" }] });
    expect(String(pending.response.say)).toContain("متسجلهاش تاني بـrecord_draft");
    const drafted = await changeDraftCoachTool.run({ action: "bank_confirm", fields: { bank_id: 81, title: "طلبات", amount: 450 } }, ctx);
    expect(drafted.card).toMatchObject({ title: "تسجيل رسالة البنك", items: [{ amount: 450 }] });
    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("آه سجلها");
    expect((await confirmTool.run({ draft_id: drafted.response.draft_id }, ctx)).response).toMatchObject({ ok: true, done: "اتسجلت رسالة البنك" });
    expect(confirmed).toEqual([81]);
  });
});
