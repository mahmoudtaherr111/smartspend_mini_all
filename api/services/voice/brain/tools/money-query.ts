/**
 * money_query: every figure the call may say about the user's money, from the finance semantic layer (Cairo
 * business days). Results are short — the facts with how to say them, what the data does not cover, and a card for
 * the screen — never raw rows, because every token of a result is billed again on each later turn.
 */
import type { VoiceFactCard } from "../../../../../contracts/voice-protocol";
import { businessDateKey } from "../../../../lib/app-time";
import { arabicDisplayName, canonicalCategoryId, CATEGORIES } from "../../../../lib/category-registry";
import {
  getCategoryInclusion,
  getCategoryTotal,
  getClassificationTrace,
  getFinanceBreakdown,
  getFinanceSummary,
  getFinanceTransactions,
  getGoalFeasibility,
  getGoalProgress,
  getPersonTotal,
  getTransactionLookup,
  getWalletSummary,
} from "../../../finance-semantic-layer/resolvers";
import { resolveFinancePeriod } from "../../../finance-semantic-layer/period-resolver";
import type { FinanceContext, FinanceGranularity, FinancePeriodInput } from "../../../finance-semantic-layer/types";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { spellPercent } from "../spoken";
import { extractSpokenNumbers } from "../validator";
import { readPendingQuestions, readStoredReport } from "./reports";
import { num, str, type ToolContext, type VoiceTool } from "./types";

const METRICS = [
  "total", "breakdown", "compare", "drivers", "transactions", "why", "includes", "report", "feasibility",
  "balance", "budgets", "goals", "pending",
] as const;
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

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** The month asked about (YYYY-MM), last month when none is given: the last one with a whole report. */
function monthFor(args: Record<string, unknown>, now: Date): { month: string; input: FinancePeriodInput; label: string } {
  const today = businessDateKey(now);
  const asked = str(args.month);
  let month: string;
  // A month still to come is read as this month so far.
  if (asked && /^\d{4}-\d{2}$/.test(asked)) month = asked > today.slice(0, 7) ? today.slice(0, 7) : asked;
  else {
    const [y, m] = today.split("-").map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return {
    month,
    input: { period: "custom", startDate: `${month}-01`, endDate: end < today ? end : today },
    label: `${MONTH_NAMES[m - 1]} ${y}`,
  };
}

/** How a transaction got its category, in the user's words. */
const CLASSIFIED_BY: Record<string, string> = {
  rule_engine: "قاعدة ثابتة من كلامك",
  ai: "الذكاء الاصطناعي",
  manual: "انت اخترته بنفسك",
  vision: "من صورة الإيصال",
  system: "النظام",
};

const RATING: Record<string, string> = { easy: "سهلة", moderate: "متوسطة", challenging: "صعبة" };

/**
 * A stored subcategory as the user would say it: Arabic as written, a registry id ("restaurant") by its Arabic name,
 * and nothing for any other English key, which would otherwise be read out in English.
 */
function subCategoryName(category: string | null | undefined, sub: string | null | undefined): string | null {
  if (!sub) return null;
  if (!/^[a-z0-9_]+$/i.test(sub)) return sub;
  const id = canonicalCategoryId(category);
  return CATEGORIES.find((entry) => entry.id === id)?.subcategories?.find((entry) => entry.id === sub)?.name_ar ?? null;
}

/** A stored category (often an English key such as "transport") as the user would say it. */
function categoryName(category: string | null | undefined, sub?: string | null): string {
  const main = arabicDisplayName(canonicalCategoryId(category) === "uncategorized" ? category : canonicalCategoryId(category));
  const subName = subCategoryName(category, sub);
  return subName ? `${main} / ${subName}` : main;
}

interface Found {
  id: number;
  amount: number;
  category: string;
  subCategory?: string | null;
  description?: string | null;
  date: string;
}

/**
 * One transaction the user describes: by a word from it ("أوبر"), by a category they name ("المواصلات", which is a
 * category, not text to find), and by its amount when they say one ("الأربعين جنيه").
 */
async function findTransaction(
  finance: FinanceContext,
  input: FinancePeriodInput,
  search: string | undefined,
  category: string | undefined,
  amount: number | undefined,
  types: string[] | undefined,
): Promise<Found | null> {
  const idOf = (word: string | undefined) => (word && canonicalCategoryId(word) !== "uncategorized" ? canonicalCategoryId(word) : undefined);
  const namedCategory = idOf(category);
  // The words as written first ("أوبر" is a merchant before it is the ride-hailing category), then as a category.
  if (amount !== undefined) {
    const list = await getFinanceTransactions(finance, { ...input, category: namedCategory, limit: 50, transactionTypes: types });
    const byAmount = list.transactions.filter((tx) => Math.abs(tx.amount - amount) < 0.5);
    const needle = (search ?? "").replace(/\s+/g, "");
    const searchCategory = idOf(search);
    return byAmount.find((tx) => !needle || String(tx.description ?? "").replace(/\s+/g, "").includes(needle))
      ?? (searchCategory ? byAmount.find((tx) => canonicalCategoryId(tx.category) === searchCategory) : undefined)
      ?? null;
  }
  const byText = search ? await getTransactionLookup(finance, search, namedCategory, types, input) : null;
  if (byText) return byText;
  const categoryId = namedCategory ?? idOf(search);
  return categoryId ? getTransactionLookup(finance, "", categoryId, types, input) : null;
}

async function run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const metric = (METRICS as readonly string[]).includes(String(args.metric)) ? String(args.metric) : "total";
  // Looking for one transaction or what a category holds reaches back three months unless a period is named;
  // totals and comparisons default to this month (the salary cycle when there is one).
  const lookup = metric === "why" || metric === "includes" || (metric === "transactions" && Boolean(str(args.search)));
  const periodName = (PERIODS as readonly string[]).includes(String(args.period))
    ? (String(args.period) as Period)
    : lookup ? "last_90_days" : "this_month";
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
      extra: { months: goals.map((goal) => goal.estimatedMonthsNeeded ?? null) },
      coverage: goals.length ? "المدة تقدير من الدخل والمصروف." : "مفيش أهداف شغالة.",
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

  if (metric === "report") {
    const { month, input: monthInput, label: monthLabel } = monthFor(args, ctx.now());
    const [summary, breakdown, stored] = await Promise.all([
      getFinanceSummary(finance, monthInput),
      getFinanceBreakdown(finance, { ...monthInput, granularity: "category", limit: 3 }),
      readStoredReport(ctx.identity, month),
    ]);
    // A written report may state its own figures; saying them back is quoting it, not inventing them.
    for (const point of stored?.points ?? []) for (const number of extractSpokenNumbers(point)) ctx.ledger.noteUserValue(number.value);
    return outcome({
      title: `تقرير ${monthLabel}`,
      facts: [
        { label: "المصروف", value: summary.totalExpense },
        { label: "الدخل", value: summary.totalIncome },
        ...breakdown.items.slice(0, 3).map((item) => ({ label: item.name, value: item.amount })),
      ],
      extra: stored
        ? { report: stored.points, written_on: stored.writtenOn, from: stored.source === "analysis" ? "تحليل الشهر في التطبيق" : "تقرير آخر الشهر" }
        : {},
      coverage: !summary.transactionCount ? EMPTY_NOTE : stored ? undefined : "مفيش تقرير مكتوب للشهر ده؛ دي أرقامه بس.",
    }, ctx, monthLabel);
  }

  if (metric === "drivers") {
    // What moved between the same stretch of days in the two periods, category by category.
    const before = comparableBefore(input, finance);
    const [now, then] = await Promise.all([
      getFinanceBreakdown(finance, { ...input, granularity: "category", limit: 12 }),
      getFinanceBreakdown(finance, { ...before.input, granularity: "category", limit: 12 }),
    ]);
    const previous = new Map(then.items.map((item) => [item.name, item.amount]));
    const names = new Set([...now.items.map((item) => item.name), ...previous.keys()]);
    const changes = [...names]
      .map((name) => ({ name, diff: (now.items.find((item) => item.name === name)?.amount ?? 0) - (previous.get(name) ?? 0) }))
      .filter((change) => Math.abs(change.diff) >= 1)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 3);
    return outcome({
      title: "إيه اللي اتغير",
      facts: changes.map((change) => ({ label: `${change.name} ${change.diff > 0 ? "زاد" : "قل"}`, value: Math.abs(change.diff) })),
      coverage: changes.length ? undefined : "مفيش فرق يذكر.",
    }, ctx, `${label} مقارنة بـ ${before.label}`);
  }

  if (metric === "why") {
    const amount = num(args.amount);
    if (!search && !category && amount === undefined) {
      return { response: { ok: false, error: "missing_search", say: "اسأل عن أنهي عملية: المحل أو الحاجة أو المبلغ." } };
    }
    const found = await findTransaction(finance, input, search, category, amount, ["expense"]);
    const trace = found ? await getClassificationTrace(finance, found.description || search || "", input) : null;
    const described = [search, category, amount !== undefined ? `${amount} جنيه` : ""].filter(Boolean).join(" ");
    if (!found) return outcome({ title: described, facts: [], coverage: `مالقيتش عملية زي «${described}» في ${label}.` }, ctx, label);
    const tx = trace && trace.transaction.id === found.id ? trace.transaction : found;
    return outcome({
      title: `تصنيف ${tx.description || described}`,
      facts: [{ label: tx.description || categoryName(tx.category), value: tx.amount, exact: true }],
      extra: {
        category: categoryName(tx.category, tx.subCategory),
        by: trace && trace.transaction.id === found.id ? CLASSIFIED_BY[String(trace.parsedBy)] ?? "التصنيف التلقائي" : "التصنيف التلقائي",
        sure: trace && typeof trace.confidence === "number" ? spellPercent(Math.round(trace.confidence)) : null,
        date: tx.date,
      },
      coverage: "لو التصنيف مش مظبوط، ممكن نغيره (change_draft).",
    }, ctx, label);
  }

  if (metric === "includes") {
    if (!category) return { response: { ok: false, error: "missing_category", say: "اسأل عن أنهي فئة." } };
    const inclusion = await getCategoryInclusion(finance, category, input);
    return outcome({
      title: `إيه اللي في ${category}`,
      facts: inclusion.sampleTransactions.slice(0, 3).map((tx) => ({ label: tx.description, value: tx.amount, exact: true })),
      extra: { places: inclusion.merchants.slice(0, 5), count: inclusion.totalMatched },
      coverage: inclusion.totalMatched ? undefined : EMPTY_NOTE,
    }, ctx, label);
  }

  if (metric === "feasibility") {
    const amount = num(args.amount);
    if (!amount || amount <= 0) return { response: { ok: false, error: "missing_amount", say: "اسأل عن المبلغ." } };
    // The month's surplus, what is in the wallets as recorded, and the goals it would compete with.
    const [feasibility, wallets, progress] = await Promise.all([
      getGoalFeasibility(finance, { period: "current_month", targetAmount: amount }),
      getWalletSummary(finance),
      getGoalProgress(finance),
    ]);
    const goals = progress.goals.filter((goal) => goal.status === "active").slice(0, 2);
    return outcome({
      title: "تقدر عليها؟",
      facts: [
        { label: "المبلغ", value: amount, exact: true },
        { label: "اللي بيفضل في الشهر", value: Math.max(0, Math.round(feasibility.monthlyCapacity)) },
        ...(wallets.walletCount ? [{ label: "الأرصدة المسجلة", value: wallets.totalBalance }] : []),
      ],
      extra: {
        months: feasibility.estimatedMonths,
        rating: RATING[feasibility.feasibilityRating] ?? feasibility.feasibilityRating,
        cut_first: feasibility.topExpenseLevers.slice(0, 2).map((lever) => lever.category),
        goals: goals.map((goal) => goal.title),
      },
      coverage: "من الدخل والمصروف والأرصدة زي ما اتسجلوا، مش كشف بنك.",
    }, ctx, "الشهر ده");
  }

  if (metric === "pending") {
    const pending = await readPendingQuestions(ctx.identity);
    return {
      response: {
        ok: true,
        count: pending.count,
        waiting: pending.items,
        say: pending.count
          ? "قول إن فيه عمليات ماتسجلتش لسه عشان ناقصها تفصيلة. لو الوقت مناسب اسأل سؤال أول واحدة بكلامك؛ ولما يرد، " +
            "نادي record_draft بردّه هو في words ومعاه clarification_id بتاعها، واعرض المسودة زي أي تسجيل."
          : "مفيش حاجة مستنية توضيح.",
      },
    };
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
    // Entries without a shop come back as "unknown", which the call would read out in English.
    const items = breakdown.items.slice(0, limit).map((item) => ({ ...item, name: item.name === "unknown" ? "من غير اسم محل" : item.name }));
    return outcome({
      title: "المصروف موزّع إزاي",
      facts: [
        { label: "الإجمالي", value: breakdown.totalExpense },
        ...items.map((item) => ({ label: item.name, value: item.amount })),
      ],
      extra: { shares: items.map((item) => ({ name: item.name, share: spellPercent(item.percent) })) },
      coverage: breakdown.items.length ? undefined : EMPTY_NOTE,
    }, ctx, label);
  }

  if (metric === "transactions") {
    const amount = num(args.amount);
    if (search || amount !== undefined) {
      const match = await findTransaction(finance, input, search, category, amount, income ? ["income"] : undefined);
      const described = [search, amount !== undefined ? `${amount} جنيه` : ""].filter(Boolean).join(" ");
      return outcome({
        title: `آخر عملية لـ ${described}`,
        facts: match ? [{ label: match.description || categoryName(match.category), value: match.amount, exact: true }] : [],
        extra: match ? { date: match.date, category: categoryName(match.category, match.subCategory) } : {},
        coverage: match ? undefined : `مالقيتش عملية زي «${described}» في ${label}.`,
      }, ctx, label);
    }
    const list = await getFinanceTransactions(finance, {
      ...input, category, limit, transactionTypes: income ? ["income"] : ["expense"],
    });
    return outcome({
      title: "آخر العمليات",
      facts: list.transactions.slice(0, limit).map((tx) => ({ label: tx.description || categoryName(tx.category), value: tx.amount, exact: true })),
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
      extra: {
        count: total.transactionCount,
        top: total.topSubCategories.map((sub) => subCategoryName(category, sub.name)).filter(Boolean).slice(0, 3),
      },
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
      "The user's own records, one question per call: total, breakdown, compare (same days before), drivers (what " +
      "changed), transactions, why (how a transaction was classified; needs search), includes (what a category " +
      "counts), report (a month's written report; month), feasibility (can they afford amount), balance, budgets, " +
      "goals, pending (entries waiting for their answer). Say numbers as the 'say' forms.",
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
        month: { type: "string", description: "YYYY-MM, for report; default last month" },
        amount: { type: "number", description: "EGP: for feasibility, or to find a transaction by its amount (why, transactions)" },
      },
      required: ["metric"],
    },
  },
  run,
};
