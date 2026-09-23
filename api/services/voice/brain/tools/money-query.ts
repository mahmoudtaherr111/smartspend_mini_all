/**
 * money_query: every figure the call may say about the user's money, from the finance semantic layer (Cairo
 * business days). Results are short — the facts with how to say them, what the data does not cover, and a card for
 * the screen — never raw rows, because every token of a result is billed again on each later turn.
 */
import type { VoiceFactCard } from "../../../../../contracts/voice-protocol";
import { businessDateKey } from "../../../../lib/app-time";
import {
  getCategoryTotal,
  getFinanceBreakdown,
  getFinanceSummary,
  getFinanceTransactions,
  getGoalProgress,
  getPersonTotal,
  getTransactionLookup,
  getWalletSummary,
} from "../../../finance-semantic-layer/resolvers";
import { resolveFinancePeriod } from "../../../finance-semantic-layer/period-resolver";
import type { FinanceContext, FinanceGranularity, FinancePeriodInput } from "../../../finance-semantic-layer/types";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { spellPercent } from "../spoken";
import { num, str, type ToolContext, type VoiceTool } from "./types";

const METRICS = ["total", "breakdown", "compare", "transactions", "balance", "budgets", "goals"] as const;
const PERIODS = [
  "today", "yesterday", "this_week", "this_month", "last_month", "salary_cycle",
  "last_90_days", "this_year", "last_year", "custom",
] as const;
type Period = (typeof PERIODS)[number];

const DAY_MS = 86_400_000;

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function validKey(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** The period the model asked for, as the finance layer reads it, with an Arabic name for it. */
export function periodFor(period: Period, args: Record<string, unknown>, now: Date): { input: FinancePeriodInput; label: string } {
  const today = businessDateKey(now);
  const year = Number(today.slice(0, 4));
  switch (period) {
    case "today": return { input: { period: "today" }, label: "النهارده" };
    case "yesterday": return { input: { period: "yesterday" }, label: "امبارح" };
    case "this_week": return { input: { period: "current_week" }, label: "الأسبوع ده" };
    case "last_month": return { input: { period: "previous_month" }, label: "الشهر اللي فات" };
    case "salary_cycle": return { input: { period: "salary_cycle" }, label: "من يوم المرتب" };
    case "last_90_days": return { input: { period: "custom", startDate: shiftKey(today, -89), endDate: today }, label: "آخر تلات شهور" };
    case "this_year": return { input: { period: "custom", startDate: `${year}-01-01`, endDate: today }, label: "السنة دي" };
    case "last_year": return { input: { period: "custom", startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` }, label: "السنة اللي فاتت" };
    case "custom": {
      const from = validKey(str(args.from)) ?? today;
      const to = validKey(str(args.to)) ?? from;
      return { input: { period: "custom", startDate: from, endDate: to }, label: from === to ? `يوم ${from}` : `من ${from} لـ ${to}` };
    }
    default: return { input: { period: "current_month" }, label: "الشهر ده" };
  }
}

/** The same stretch of time before: yesterday for today, the previous cycle's first N days for this one. */
function comparableBefore(input: FinancePeriodInput, ctx: FinanceContext): { input: FinancePeriodInput; label: string } {
  const current = resolveFinancePeriod(input, ctx);
  if (input.period === "today") return { input: { period: "yesterday" }, label: "امبارح" };
  const startKey = businessDateKey(current.startDate);
  if (input.period === "previous_month") {
    const before = resolveFinancePeriod({ period: "custom", startDate: shiftKey(startKey, -1), endDate: shiftKey(startKey, -1) }, ctx);
    const month = resolveFinancePeriod({ period: "current_month" }, { ...ctx, referenceDate: before.startDate });
    return {
      input: { period: "custom", startDate: businessDateKey(month.startDate), endDate: businessDateKey(month.endDate) },
      label: "الشهر اللي قبله",
    };
  }
  const days = current.daysElapsed;
  if (input.period === "current_month" || input.period === "salary_cycle") {
    const previous = resolveFinancePeriod({ period: "previous_month" }, ctx);
    const prevStart = businessDateKey(previous.startDate);
    return {
      input: { period: "custom", startDate: prevStart, endDate: shiftKey(prevStart, days - 1) },
      label: `نفس الأيام من الشهر اللي فات (${days} يوم)`,
    };
  }
  // A week, a year so far or a custom range: the same number of days just before it.
  const span = input.period === "custom" ? current.daysTotal : days;
  return {
    input: { period: "custom", startDate: shiftKey(startKey, -span), endDate: shiftKey(startKey, -1) },
    label: "نفس المدة اللي قبلها",
  };
}

interface Built {
  facts: Array<{ label: string; value: number; exact?: boolean }>;
  extra?: Record<string, unknown>;
  coverage?: string;
  title: string;
}

function outcome(built: Built, ctx: ToolContext, periodLabel: string): ToolRunOutcome {
  ctx.ledger.nextBatch();
  const facts = built.facts.map((fact, index) => {
    const entry = ctx.ledger.add({ id: `mq_${index}`, label: fact.label, value: fact.value, source: "ledger", exact: fact.exact });
    return { label: fact.label, value: fact.value, say: entry.say };
  });
  const card: VoiceFactCard = {
    kind: "fact",
    id: `mq_${Date.now()}`,
    title: built.title,
    period: periodLabel,
    items: built.facts.slice(0, 8).map((fact) => ({ label: fact.label, value: fact.value, unit: "EGP" })),
    coverage: built.coverage,
  };
  return {
    response: { ok: true, period: periodLabel, facts, ...(built.coverage ? { coverage: built.coverage } : {}), ...built.extra },
    card,
  };
}

const EMPTY_NOTE = "مفيش حاجة متسجلة في الفترة دي. ده مش معناه إن مفيش صرف، يمكن ماتسجلش.";

async function run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const metric = (METRICS as readonly string[]).includes(String(args.metric)) ? String(args.metric) : "total";
  const periodName = (PERIODS as readonly string[]).includes(String(args.period)) ? (String(args.period) as Period) : "this_month";
  const finance: FinanceContext = { userId: ctx.identity.userId, userType: ctx.identity.userType, salaryDay: await ctx.salaryDay() };
  const { input, label } = periodFor(periodName, args, ctx.now());
  const income = args.type === "income";
  const category = str(args.category, 60);
  const person = str(args.person, 60);
  const search = str(args.search, 60);
  const limit = Math.min(8, Math.max(1, Math.floor(num(args.limit) ?? 5)));

  if (metric === "balance") {
    const wallets = await getWalletSummary(finance);
    return outcome({
      title: "أرصدة المحافظ",
      facts: [
        { label: "إجمالي الأرصدة", value: wallets.totalBalance },
        ...wallets.wallets.slice(0, limit).map((wallet) => ({ label: wallet.name, value: wallet.balance })),
      ],
      coverage: wallets.walletCount === 0
        ? "مفيش محافظ متسجلة."
        : "دي الأرصدة زي ما اتسجلت في التطبيق، مش كشف حساب لحظي من البنك.",
    }, ctx, "دلوقتي");
  }

  if (metric === "goals") {
    const progress = await getGoalProgress(finance);
    const goals = progress.goals.filter((goal) => goal.status === "active").slice(0, limit);
    return outcome({
      title: "الأهداف",
      facts: goals.map((goal) => ({ label: `هدف ${goal.title}`, value: goal.targetAmount })),
      extra: { months_needed: goals.map((goal) => ({ goal: goal.title, months: goal.estimatedMonthsNeeded ?? null })) },
      coverage: goals.length
        ? "مدة الوصول تقدير من صافي الدخل والمصروف، مش من فلوس محطوطة فعلاً للهدف."
        : "مفيش أهداف شغالة.",
    }, ctx, "دلوقتي");
  }

  if (metric === "budgets") {
    const budgets = (await ctx.app.listBudgets(ctx.identity)).slice(0, limit);
    return outcome({
      title: "الميزانيات",
      facts: budgets.flatMap((budget) => [
        { label: `ميزانية ${budget.title}`, value: budget.limit },
        { label: `المصروف من ميزانية ${budget.title}`, value: budget.spent },
      ]),
      extra: { used: budgets.map((budget) => ({ budget: budget.title, say: spellPercent(budget.percent), over: budget.exceeded })) },
      coverage: budgets.length ? undefined : "مفيش ميزانيات متعملة.",
    }, ctx, "الدورة دي");
  }

  if (metric === "compare") {
    const before = comparableBefore(input, finance);
    const [now, then] = await Promise.all([getFinanceSummary(finance, input), getFinanceSummary(finance, before.input)]);
    const currentValue = income ? now.totalIncome : now.totalExpense;
    const previousValue = income ? then.totalIncome : then.totalExpense;
    const change = previousValue > 0 ? Math.round(((currentValue - previousValue) / previousValue) * 100) : null;
    return outcome({
      title: income ? "مقارنة الدخل" : "مقارنة المصروف",
      facts: [
        { label: label, value: currentValue },
        { label: before.label, value: previousValue },
        { label: "الفرق", value: Math.abs(currentValue - previousValue) },
      ],
      extra: {
        direction: currentValue > previousValue ? "more" : currentValue < previousValue ? "less" : "same",
        change: change === null ? null : spellPercent(Math.abs(change)),
      },
      coverage: now.transactionCount === 0 || then.transactionCount === 0 ? EMPTY_NOTE : undefined,
    }, ctx, `${label} مقارنة بـ ${before.label}`);
  }

  if (metric === "breakdown") {
    const granularity = (["category", "day", "week", "month", "merchant"].includes(String(args.group_by))
      ? String(args.group_by) : "category") as FinanceGranularity;
    const breakdown = await getFinanceBreakdown(finance, { ...input, category, granularity, limit });
    return outcome({
      title: "المصروف موزّع إزاي",
      facts: [
        { label: "الإجمالي", value: breakdown.totalExpense },
        ...breakdown.items.slice(0, limit).map((item) => ({ label: item.name, value: item.amount })),
      ],
      extra: { shares: breakdown.items.slice(0, limit).map((item) => ({ name: item.name, share: spellPercent(item.percent) })) },
      coverage: breakdown.items.length ? undefined : EMPTY_NOTE,
    }, ctx, label);
  }

  if (metric === "transactions") {
    if (search) {
      const match = await getTransactionLookup(finance, search, category, income ? ["income"] : undefined, input);
      return outcome({
        title: `آخر عملية لـ ${search}`,
        facts: match ? [{ label: match.description || match.category, value: match.amount, exact: true }] : [],
        extra: match ? { date: match.date, category: match.category } : {},
        coverage: match ? undefined : `مالقيتش عملية فيها «${search}» في الفترة دي.`,
      }, ctx, label);
    }
    const list = await getFinanceTransactions(finance, {
      ...input, category, limit, transactionTypes: income ? ["income"] : ["expense"],
    });
    return outcome({
      title: "آخر العمليات",
      facts: list.transactions.slice(0, limit).map((tx) => ({ label: tx.description || tx.category, value: tx.amount, exact: true })),
      extra: { dates: list.transactions.slice(0, limit).map((tx) => tx.date), total_matched: list.totalMatched },
      coverage: list.transactions.length ? undefined : EMPTY_NOTE,
    }, ctx, label);
  }

  // total
  if (person) {
    const total = await getPersonTotal(finance, person, input);
    return outcome({
      title: `فلوس ${person}`,
      facts: total ? [{ label: `اللي اتدفع لـ${total.name}`, value: total.totalExpense }] : [],
      coverage: total ? undefined : `مفيش حد متسجل باسم «${person}».`,
    }, ctx, label);
  }
  if (search) {
    const breakdown = await getFinanceBreakdown(finance, { ...input, granularity: "merchant", limit: 50 });
    const needle = search.replace(/\s+/g, "");
    const matches = breakdown.items.filter((item) => item.name.replace(/\s+/g, "").includes(needle));
    const value = matches.reduce((sum, item) => sum + item.amount, 0);
    return outcome({
      title: `المصروف على ${search}`,
      facts: matches.length ? [{ label: `المصروف على ${search}`, value }] : [],
      coverage: matches.length ? undefined : `مالقيتش صرف باسم «${search}» في الفترة دي.`,
    }, ctx, label);
  }
  if (category) {
    const total = await getCategoryTotal(finance, category, input);
    const value = income ? total.totalIncome : total.totalExpense;
    return outcome({
      title: `${category}`,
      facts: [{ label: income ? `دخل ${category}` : `مصروف ${category}`, value }],
      extra: { count: total.transactionCount, top: total.topSubCategories.slice(0, 3).map((sub) => sub.name) },
      coverage: total.transactionCount ? undefined : EMPTY_NOTE,
    }, ctx, label);
  }
  const summary = await getFinanceSummary(finance, input);
  return outcome({
    title: income ? "الدخل" : "المصروف",
    facts: income
      ? [{ label: `دخل ${label}`, value: summary.totalIncome }]
      : [
          { label: `مصروف ${label}`, value: summary.totalExpense },
          ...(summary.period.daysTotal > 1 ? [{ label: "متوسط اليوم", value: Math.round(summary.dailyAverageExpense) }] : []),
        ],
    extra: { count: summary.transactionCount },
    coverage: summary.transactionCount ? undefined : EMPTY_NOTE,
  }, ctx, label);
}

export const moneyQuery: VoiceTool = {
  declaration: {
    name: "money_query",
    description:
      "Exact figures from the user's own records: totals, where money went, comparisons, latest transactions, " +
      "wallet balances, budgets and goals. Returns facts with a 'say' form to speak and notes on missing data.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: [...METRICS] },
        period: { type: "string", enum: [...PERIODS], description: "Default this_month (the salary cycle when there is a salary day)." },
        from: { type: "string", description: "YYYY-MM-DD, with period custom" },
        to: { type: "string", description: "YYYY-MM-DD, with period custom" },
        category: { type: "string", description: "Category in the user's words, e.g. أكل, مواصلات" },
        person: { type: "string", description: "A person's name" },
        search: { type: "string", description: "Merchant or word, e.g. طلبات" },
        type: { type: "string", enum: ["expense", "income"] },
        group_by: { type: "string", enum: ["category", "day", "week", "month", "merchant"] },
        limit: { type: "integer" },
      },
      required: ["metric"],
    },
  },
  run,
};
