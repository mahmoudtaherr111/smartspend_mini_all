/**
 * money_query: every figure the call may say about the user's money, from the finance semantic layer (Cairo
 * business days). Results are short — the facts with how to say them, what the data does not cover, and a card for
 * the screen — never raw rows, because every token of a result is billed again on each later turn.
 */
import type { VoiceFactCard } from "../../../../../contracts/voice-protocol";
import { businessDateKey } from "../../../../lib/app-time";
import {
  arabicDisplayName,
  canonicalCategoryId,
  CATEGORIES,
} from "../../../../lib/category-registry";
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
  getTextSpendingTotal,
  getTransactionLookup,
  getWalletSummary,
} from "../../../finance-semantic-layer/resolvers";
import { resolveFinancePeriod } from "../../../finance-semantic-layer/period-resolver";
import { getFinanceCacheGen } from "../../../finance-semantic-layer/cache";
import type {
  FinanceContext,
  FinanceGranularity,
  FinancePeriodInput,
} from "../../../finance-semantic-layer/types";
import type { ToolRunOutcome } from "../../gateway/call-session";
import type { FactUnit } from "../facts";
import { spellPercent } from "../spoken";
import { extractSpokenNumbers } from "../validator";
import { readPendingQuestions, readStoredReport } from "./reports";
import { commitmentsAnswer, planAnswer } from "./coach";
import { num, str, type ToolContext, type VoiceTool } from "./types";

const METRICS = [
  "total",
  "breakdown",
  "compare",
  "drivers",
  "transactions",
  "why",
  "includes",
  "report",
  "feasibility",
  "balance",
  "budgets",
  "goals",
  "pending",
  "debts",
  "installments",
  "season",
] as const;
const SEASONS = [
  "ramadan",
  "eid_fitr",
  "eid_adha",
  "school",
  "summer",
] as const;
/** The coach call's follow-up reads (api/services/voice/brain/tools/coach.ts). */
const COACH_METRICS = ["commitments", "plan"] as const;
/** What a business's own ledger answers; balances, budgets, goals, debts and the rest are the person's. */
const BUSINESS_METRICS = [
  "total",
  "breakdown",
  "compare",
  "drivers",
  "transactions",
  "why",
  "includes",
] as const;
const PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "last_month",
  "salary_cycle",
  "last_90_days",
  "this_year",
  "last_year",
  "custom",
] as const;
type Period = (typeof PERIODS)[number];

const DAY_MS = 86_400_000;

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function validKey(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** The period the model asked for, as the finance layer reads it, with an Arabic name for it. */
export function periodFor(
  period: Period,
  args: Record<string, unknown>,
  now: Date,
): { input: FinancePeriodInput; label: string } {
  const today = businessDateKey(now);
  const year = Number(today.slice(0, 4));
  switch (period) {
    case "today":
      return { input: { period: "today" }, label: "النهارده" };
    case "yesterday":
      return { input: { period: "yesterday" }, label: "امبارح" };
    case "this_week":
      return { input: { period: "current_week" }, label: "الأسبوع ده" };
    case "last_month":
      return { input: { period: "previous_month" }, label: "الشهر اللي فات" };
    case "salary_cycle":
      return { input: { period: "salary_cycle" }, label: "من يوم المرتب" };
    case "last_90_days":
      return {
        input: {
          period: "custom",
          startDate: shiftKey(today, -89),
          endDate: today,
        },
        label: "آخر تلات شهور",
      };
    case "this_year":
      return {
        input: { period: "custom", startDate: `${year}-01-01`, endDate: today },
        label: "السنة دي",
      };
    case "last_year":
      return {
        input: {
          period: "custom",
          startDate: `${year - 1}-01-01`,
          endDate: `${year - 1}-12-31`,
        },
        label: "السنة اللي فاتت",
      };
    case "custom": {
      const from = validKey(str(args.from)) ?? today;
      const to = validKey(str(args.to)) ?? from;
      return {
        input: { period: "custom", startDate: from, endDate: to },
        label: from === to ? `يوم ${from}` : `من ${from} لـ ${to}`,
      };
    }
    default:
      return { input: { period: "current_month" }, label: "الشهر ده" };
  }
}

/** The same stretch of time before: yesterday for today, the previous cycle's first N days for this one. */
function comparableBefore(
  input: FinancePeriodInput,
  ctx: FinanceContext,
): { input: FinancePeriodInput; label: string } {
  const current = resolveFinancePeriod(input, ctx);
  if (input.period === "today")
    return { input: { period: "yesterday" }, label: "امبارح" };
  const startKey = businessDateKey(current.startDate);
  if (input.period === "previous_month") {
    const before = resolveFinancePeriod(
      {
        period: "custom",
        startDate: shiftKey(startKey, -1),
        endDate: shiftKey(startKey, -1),
      },
      ctx,
    );
    const month = resolveFinancePeriod(
      { period: "current_month" },
      { ...ctx, referenceDate: before.startDate },
    );
    return {
      input: {
        period: "custom",
        startDate: businessDateKey(month.startDate),
        endDate: businessDateKey(month.endDate),
      },
      label: "الشهر اللي قبله",
    };
  }
  const days = current.daysElapsed;
  if (input.period === "current_month" || input.period === "salary_cycle") {
    const previous = resolveFinancePeriod({ period: "previous_month" }, ctx);
    const prevStart = businessDateKey(previous.startDate);
    return {
      input: {
        period: "custom",
        startDate: prevStart,
        endDate: shiftKey(prevStart, days - 1),
      },
      label: `نفس الأيام من الشهر اللي فات (${days} يوم)`,
    };
  }
  // A week, a year so far or a custom range: the same number of days just before it.
  const span = input.period === "custom" ? current.daysTotal : days;
  return {
    input: {
      period: "custom",
      startDate: shiftKey(startKey, -span),
      endDate: shiftKey(startKey, -1),
    },
    label: "نفس المدة اللي قبلها",
  };
}

interface Built {
  facts: Array<{
    label: string;
    value: number;
    exact?: boolean;
    unit?: FactUnit;
  }>;
  extra?: Record<string, unknown>;
  coverage?: string;
  title: string;
}

function outcome(
  built: Built,
  ctx: ToolContext,
  periodLabel: string,
): ToolRunOutcome {
  ctx.ledger.nextBatch();
  const facts = built.facts.map((fact, index) => {
    const entry = ctx.ledger.add({
      id: `mq_${index}`,
      label: fact.label,
      value: fact.value,
      source: "ledger",
      exact: fact.exact,
      unit: fact.unit,
      period: periodLabel,
      ...(fact.unit && fact.unit !== "EGP" ? { say: String(fact.value) } : {}),
    });
    // The ref lets calculate use this figure without retyping it.
    return {
      ref: entry.ref,
      label: fact.label,
      value: fact.value,
      say: entry.say,
      ...(entry.unit !== "EGP" ? { unit: entry.unit } : {}),
    };
  });
  const card: VoiceFactCard = {
    kind: "fact",
    id: `mq_${Date.now()}`,
    title: built.title,
    period: periodLabel,
    items: built.facts
      .filter((fact) => !fact.unit || fact.unit === "EGP")
      .slice(0, 8)
      .map((fact) => ({ label: fact.label, value: fact.value, unit: "EGP" })),
    coverage: built.coverage,
  };
  return {
    response: {
      ok: true,
      period: periodLabel,
      facts,
      ...(built.coverage ? { coverage: built.coverage } : {}),
      ...built.extra,
    },
    card,
  };
}

/** A read that stopped at the finance layer's row limit (ROW_LIMIT): the period's total is still exact. */
const PARTIAL_NOTE =
  "الفترة دي فيها عمليات كتير أوي، فالرقم ده من أحدث عشر آلاف عملية بس؛ الإجمالي الكامل للفترة مظبوط لو اتسأل عنه من غير تصنيف.";
const EMPTY_NOTE =
  "مفيش حاجة متسجلة في الفترة دي. ده مش معناه إن مفيش صرف، يمكن ماتسجلش.";

const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** The month asked about (YYYY-MM), last month when none is given: the last one with a whole report. */
function monthFor(
  args: Record<string, unknown>,
  now: Date,
): { month: string; input: FinancePeriodInput; label: string } {
  const today = businessDateKey(now);
  const asked = str(args.month);
  let month: string;
  // A month still to come is read as this month so far.
  if (asked && /^\d{4}-\d{2}$/.test(asked))
    month = asked > today.slice(0, 7) ? today.slice(0, 7) : asked;
  else {
    const [y, m] = today.split("-").map(Number);
    month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  }
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return {
    month,
    input: {
      period: "custom",
      startDate: `${month}-01`,
      endDate: end < today ? end : today,
    },
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

const RATING: Record<string, string> = {
  easy: "سهلة",
  moderate: "متوسطة",
  challenging: "صعبة",
};

/**
 * A stored subcategory as the user would say it: Arabic as written, a registry id ("restaurant") by its Arabic name,
 * and nothing for any other English key, which would otherwise be read out in English.
 */
function subCategoryName(
  category: string | null | undefined,
  sub: string | null | undefined,
): string | null {
  if (!sub) return null;
  if (!/^[a-z0-9_]+$/i.test(sub)) return sub;
  const id = canonicalCategoryId(category);
  return (
    CATEGORIES.find((entry) => entry.id === id)?.subcategories?.find(
      (entry) => entry.id === sub,
    )?.name_ar ?? null
  );
}

/** A stored category (often an English key such as "transport") as the user would say it. */
function categoryName(
  category: string | null | undefined,
  sub?: string | null,
): string {
  const main = arabicDisplayName(
    canonicalCategoryId(category) === "uncategorized"
      ? category
      : canonicalCategoryId(category),
  );
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
  const idOf = (word: string | undefined) =>
    word && canonicalCategoryId(word) !== "uncategorized"
      ? canonicalCategoryId(word)
      : undefined;
  const namedCategory = idOf(category);
  // The words as written first ("أوبر" is a merchant before it is the ride-hailing category), then as a category.
  // The amount is a filter over the whole period, applied before the list is cut (it used to filter the latest 30).
  if (amount !== undefined) {
    const byText = await getFinanceTransactions(finance, {
      ...input,
      category: namedCategory,
      amount,
      text: search,
      limit: 1,
      transactionTypes: types,
    });
    if (byText.transactions[0]) return byText.transactions[0];
    const searchCategory = idOf(search);
    if (!search || !searchCategory) return null;
    const byCategory = await getFinanceTransactions(finance, {
      ...input,
      category: searchCategory,
      amount,
      limit: 1,
      transactionTypes: types,
    });
    return byCategory.transactions[0] ?? null;
  }
  const byText = search
    ? await getTransactionLookup(finance, search, namedCategory, types, input)
    : null;
  if (byText) return byText;
  const categoryId = namedCategory ?? idOf(search);
  return categoryId
    ? getTransactionLookup(finance, "", categoryId, types, input)
    : null;
}

/**
 * Every read first checks whether the user's records moved since the call last looked without a write of its own
 * (a bank message arrived, another device recorded something): then every figure said before is out of date, and
 * the answer says so.
 */
async function run(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  let changed = false;
  if (ctx.records) {
    const generation = await getFinanceCacheGen(
      ctx.identity.userId,
      ctx.identity.userType,
    ).catch(() => null);
    if (generation !== null) {
      changed =
        ctx.records.seen !== null &&
        generation !== ctx.records.seen &&
        ctx.ledger.markRecordsChanged() > 0;
      ctx.records.seen = generation;
    }
  }
  const result = await answer(args, ctx);
  if (!changed) return result;
  return {
    ...result,
    response: {
      ...result.response,
      records_changed:
        "اتسجلت عمليات جديدة من ساعة ما بدأت المكالمة (رسالة بنك أو جهاز تاني): الأرقام اللي اتقالت قبل كده ممكن تكون اتغيرت، والأرقام دي هي الأحدث.",
    },
  };
}

async function answer(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  if ((COACH_METRICS as readonly string[]).includes(String(args.metric))) {
    if (!ctx.coach)
      return {
        response: {
          ok: false,
          error: "not_available",
          say: "ده مش متاح في المكالمة دي.",
        },
      };
    const reply = (built: Built, periodLabel: string) =>
      outcome(built, ctx, periodLabel);
    return args.metric === "plan"
      ? planAnswer(ctx, reply)
      : commitmentsAnswer(ctx, reply);
  }
  const metric = (METRICS as readonly string[]).includes(String(args.metric))
    ? String(args.metric)
    : "total";
  // Looking for one transaction or what a category holds reaches back three months unless a period is named;
  // totals and comparisons default to this month (the salary cycle when there is one).
  const lookup =
    metric === "why" ||
    metric === "includes" ||
    (metric === "transactions" && Boolean(str(args.search)));
  const periodName = (PERIODS as readonly string[]).includes(
    String(args.period),
  )
    ? (String(args.period) as Period)
    : lookup
      ? "last_90_days"
      : "this_month";
  const finance: FinanceContext = {
    userId: ctx.identity.userId,
    userType: ctx.identity.userType,
    salaryDay: await ctx.salaryDay(),
  };
  // A business's own ledger, apart from the personal one: only the user's business, only on a plan that has them.
  let business: { id: number; name: string } | null = null;
  if (args.scope === "business") {
    if (!(BUSINESS_METRICS as readonly string[]).includes(metric)) {
      return {
        response: {
          ok: false,
          error: "personal_only",
          say: "ده بيتحسب للحساب الشخصي بس، مش للمشروع. قول كده واسأله لو عايز الشخصي.",
        },
      };
    }
    const found = await ctx.app.business(ctx.identity);
    if (found === "not_in_plan") {
      return {
        response: {
          ok: false,
          error: "not_in_plan",
          say: "حسابات المشروع مش في باقته. قول كده بهدوء، ولو حابب يشوف الباقات من صفحة الاشتراك.",
        },
      };
    }
    if (found === "none") {
      return {
        response: {
          ok: false,
          error: "no_business",
          say: "مفيش مشروع متسجل له. لو عايز يفصل مصاريف شغله يقدر يعمل مشروع من «وضع المشروع».",
        },
      };
    }
    business = found;
    finance.businessId = found.id;
  }
  const named = periodFor(periodName, args, ctx.now());
  const input = named.input;
  // "This month" follows the salary day when there is one (the finance layer's current_month): said as the cycle it is.
  const period =
    periodName === "this_month" && (finance.salaryDay ?? 1) > 1
      ? "الدورة دي (من يوم القبض)"
      : named.label;
  // A business's figures say whose they are, so they are never taken for the person's.
  const label = business ? `${period} — مشروع ${business.name}` : period;
  const income = args.type === "income";
  const category = str(args.category, 60);
  const person = str(args.person, 60);
  const search = str(args.search, 60);
  const limit = Math.min(8, Math.max(1, Math.floor(num(args.limit) ?? 5)));

  if (metric === "balance") {
    const wallets = await getWalletSummary(finance);
    // Each balance is what the user entered on a day; an entry older than a few days is said as old.
    const today = businessDateKey(ctx.now());
    const ages = wallets.wallets.slice(0, limit).map((wallet) => ({
      wallet: wallet.name,
      entered: wallet.observedDay ?? "مش معروف امتى",
      ...(wallet.observedDay && wallet.observedDay < shiftKey(today, -3)
        ? { old: true }
        : {}),
    }));
    return outcome(
      {
        title: "أرصدة المحافظ",
        facts: [
          { label: "إجمالي الأرصدة المسجلة", value: wallets.totalBalance },
          ...wallets.wallets
            .slice(0, limit)
            .map((wallet) => ({ label: wallet.name, value: wallet.balance })),
        ],
        extra: wallets.walletCount ? { entered: ages } : {},
        coverage:
          wallets.walletCount === 0
            ? "مفيش محافظ متسجلة."
            : "دي الأرصدة زي ما المستخدم دخّلها آخر مرة (entered)، مش كشف حساب من البنك؛ المصاريف بعدها مش متخصومة منها. " +
              "لو التاريخ قديم أو مش معروف قول كده واسأل عن الرصيد دلوقتي.",
      },
      ctx,
      "دلوقتي",
    );
  }

  if (metric === "goals") {
    const progress = await getGoalProgress(finance);
    const goals = progress.goals
      .filter((goal) => goal.status === "active")
      .slice(0, limit);
    return outcome(
      {
        title: "الأهداف",
        facts: goals.map((goal) => ({
          label: `هدف ${goal.title}`,
          value: goal.targetAmount,
        })),
        extra: {
          months: goals.map((goal) => goal.estimatedMonthsNeeded ?? null),
        },
        coverage: goals.length
          ? "المدة تقدير من الدخل والمصروف."
          : "مفيش أهداف شغالة.",
      },
      ctx,
      "دلوقتي",
    );
  }

  if (metric === "budgets") {
    const all = await ctx.app.listBudgets(ctx.identity);
    const budgets = all
      .filter((budget) => budget.status !== "paused")
      .slice(0, limit);
    const paused = all.filter((budget) => budget.status === "paused");
    return outcome(
      {
        title: "الميزانيات",
        facts: budgets.flatMap((budget) => [
          { label: `ميزانية ${budget.title}`, value: budget.limit },
          { label: `المصروف من ميزانية ${budget.title}`, value: budget.spent },
        ]),
        extra: {
          used: budgets.map((budget) => ({
            budget: budget.title,
            budget_id: budget.id,
            say: spellPercent(budget.percent),
            over: budget.exceeded,
          })),
          ...(paused.length
            ? {
                paused: paused.map((budget) => ({
                  budget: budget.title,
                  budget_id: budget.id,
                })),
              }
            : {}),
        },
        coverage: budgets.length
          ? undefined
          : paused.length
            ? "كل الميزانيات واقفة."
            : "مفيش ميزانيات متعملة.",
      },
      ctx,
      "الدورة دي",
    );
  }

  if (metric === "report") {
    const {
      month,
      input: monthInput,
      label: monthLabel,
    } = monthFor(args, ctx.now());
    const [summary, breakdown, stored] = await Promise.all([
      getFinanceSummary(finance, monthInput),
      getFinanceBreakdown(finance, {
        ...monthInput,
        granularity: "category",
        limit: 3,
      }),
      readStoredReport(ctx.identity, month),
    ]);
    // A written report may state its own figures; saying them back is quoting it, not inventing them.
    for (const point of stored?.points ?? [])
      for (const number of extractSpokenNumbers(point))
        ctx.ledger.noteUserValue(number.value);
    return outcome(
      {
        title: `تقرير ${monthLabel}`,
        facts: [
          { label: "المصروف", value: summary.totalExpense },
          { label: "الدخل", value: summary.totalIncome },
          ...breakdown.items
            .slice(0, 3)
            .map((item) => ({ label: item.name, value: item.amount })),
        ],
        extra: stored
          ? {
              report: stored.points,
              written_on: stored.writtenOn,
              from:
                stored.source === "analysis"
                  ? "تحليل الشهر في التطبيق"
                  : "تقرير آخر الشهر",
            }
          : {},
        coverage: !summary.transactionCount
          ? EMPTY_NOTE
          : stored
            ? undefined
            : "مفيش تقرير مكتوب للشهر ده؛ دي أرقامه بس.",
      },
      ctx,
      monthLabel,
    );
  }

  if (metric === "drivers") {
    // What moved between the same stretch of days in the two periods, category by category.
    const before = comparableBefore(input, finance);
    const [now, then] = await Promise.all([
      getFinanceBreakdown(finance, {
        ...input,
        granularity: "category",
        limit: 12,
      }),
      getFinanceBreakdown(finance, {
        ...before.input,
        granularity: "category",
        limit: 12,
      }),
    ]);
    const previous = new Map(
      then.items.map((item) => [item.name, item.amount]),
    );
    const names = new Set([
      ...now.items.map((item) => item.name),
      ...previous.keys(),
    ]);
    const changes = [...names]
      .map((name) => ({
        name,
        diff:
          (now.items.find((item) => item.name === name)?.amount ?? 0) -
          (previous.get(name) ?? 0),
      }))
      .filter((change) => Math.abs(change.diff) >= 1)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 3);
    return outcome(
      {
        title: "إيه اللي اتغير",
        facts: changes.map((change) => ({
          label: `${change.name} ${change.diff > 0 ? "زاد" : "قل"}`,
          value: Math.abs(change.diff),
        })),
        coverage: changes.length ? undefined : "مفيش فرق يذكر.",
      },
      ctx,
      `${label} مقارنة بـ ${before.label}`,
    );
  }

  if (metric === "why") {
    const amount = num(args.amount);
    if (!search && !category && amount === undefined) {
      return {
        response: {
          ok: false,
          error: "missing_search",
          say: "اسأل عن أنهي عملية: المحل أو الحاجة أو المبلغ.",
        },
      };
    }
    const found = await findTransaction(
      finance,
      input,
      search,
      category,
      amount,
      ["expense"],
    );
    const trace = found
      ? await getClassificationTrace(
          finance,
          found.description || search || "",
          input,
        )
      : null;
    const described = [
      search,
      category,
      amount !== undefined ? `${amount} جنيه` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (!found)
      return outcome(
        {
          title: described,
          facts: [],
          coverage: `مالقيتش عملية زي «${described}» في ${label}.`,
        },
        ctx,
        label,
      );
    const tx =
      trace && trace.transaction.id === found.id ? trace.transaction : found;
    return outcome(
      {
        title: `تصنيف ${tx.description || described}`,
        facts: [
          {
            label: tx.description || categoryName(tx.category),
            value: tx.amount,
            exact: true,
          },
        ],
        extra: {
          category: categoryName(tx.category, tx.subCategory),
          by:
            trace && trace.transaction.id === found.id
              ? (CLASSIFIED_BY[String(trace.parsedBy)] ?? "التصنيف التلقائي")
              : "التصنيف التلقائي",
          sure:
            trace && typeof trace.confidence === "number"
              ? spellPercent(Math.round(trace.confidence))
              : null,
          date: tx.date,
        },
        coverage: "لو التصنيف مش مظبوط، ممكن نغيره (change_draft).",
      },
      ctx,
      label,
    );
  }

  if (metric === "includes") {
    if (!category)
      return {
        response: {
          ok: false,
          error: "missing_category",
          say: "اسأل عن أنهي فئة.",
        },
      };
    const inclusion = await getCategoryInclusion(finance, category, input);
    return outcome(
      {
        title: `إيه اللي في ${category}`,
        facts: inclusion.sampleTransactions.slice(0, 3).map((tx) => ({
          label: tx.description,
          value: tx.amount,
          exact: true,
        })),
        extra: {
          places: inclusion.merchants.slice(0, 5),
          count: inclusion.totalMatched,
        },
        coverage: inclusion.totalMatched ? undefined : EMPTY_NOTE,
      },
      ctx,
      label,
    );
  }

  if (metric === "feasibility") {
    const amount = num(args.amount);
    if (!amount || amount <= 0)
      return {
        response: {
          ok: false,
          error: "missing_amount",
          say: "اسأل عن المبلغ.",
        },
      };
    // A month that spends more than it earns has no surplus: its shortfall is said as one, never as zero.
    // The month's surplus, what is in the wallets as recorded, and the goals it would compete with.
    const [feasibility, wallets, progress] = await Promise.all([
      getGoalFeasibility(finance, {
        period: "current_month",
        targetAmount: amount,
      }),
      getWalletSummary(finance),
      getGoalProgress(finance),
    ]);
    const goals = progress.goals
      .filter((goal) => goal.status === "active")
      .slice(0, 2);
    return outcome(
      {
        title: "تقدر عليها؟",
        facts: [
          { label: "المبلغ", value: amount, exact: true },
          feasibility.monthlyCapacity >= 0
            ? {
                label: "اللي بيفضل في الشهر",
                value: Math.round(feasibility.monthlyCapacity),
              }
            : {
                label: "العجز في الشهر (المصروف أكتر من الدخل المسجل)",
                value: Math.round(-feasibility.monthlyCapacity),
              },
          ...(wallets.walletCount
            ? [{ label: "الأرصدة المسجلة", value: wallets.totalBalance }]
            : []),
        ],
        extra: {
          months: feasibility.estimatedMonths,
          rating:
            RATING[feasibility.feasibilityRating] ??
            feasibility.feasibilityRating,
          cut_first: feasibility.topExpenseLevers
            .slice(0, 2)
            .map((lever) => lever.category),
          goals: goals.map((goal) => goal.title),
        },
        coverage: "من الدخل والمصروف والأرصدة زي ما اتسجلوا، مش كشف بنك.",
      },
      ctx,
      "الشهر ده",
    );
  }

  if (metric === "debts") {
    const standing = await ctx.app.debts(ctx.identity);
    const people = standing.people.slice(0, limit);
    const gam3eya =
      standing.gam3eya.installments > 0 || standing.gam3eya.received > 0;
    return outcome(
      {
        title: "ليك وعليك",
        facts: [
          ...(standing.owedToYou
            ? [
                {
                  label: "إجمالي اللي ليك عند الناس",
                  value: standing.owedToYou,
                },
              ]
            : []),
          ...(standing.youOwe
            ? [{ label: "إجمالي اللي عليك للناس", value: standing.youOwe }]
            : []),
          ...people.map((person) => ({
            label:
              person.balance > 0
                ? `${person.name} عليه ليك`
                : `إنت عليك لـ${person.name}`,
            value: Math.abs(person.balance),
          })),
          ...(gam3eya
            ? [
                { label: "دفعت في الجمعية", value: standing.gam3eya.paid },
                { label: "قبضت من الجمعية", value: standing.gam3eya.received },
                {
                  label: "عدد أقساط الجمعية المدفوعة",
                  value: standing.gam3eya.installments,
                  unit: "count" as const,
                },
              ]
            : []),
        ],
        extra: {
          people: people.map((person) => ({
            name: person.name,
            since: person.lastDate,
            moves: person.count,
          })),
        },
        // What the numbers rest on: loans and gam3eya transfers recorded with their direction; nothing else.
        coverage:
          "محسوب من السلف والجمعيات المتسجلة كتحويل بس، كل شخص مجموع في رقم واحد: مفيش مواعيد استحقاق متسجلة، " +
          "ولو فيه أكتر من جمعية فهي متجمعة مع بعض. اللي ماتسجلش مش محسوب.",
      },
      ctx,
      "لحد النهارده",
    );
  }

  if (metric === "installments") {
    const plans = (await ctx.app.installments(ctx.identity)).slice(0, limit);
    return outcome(
      {
        title: "الأقساط",
        facts: plans.flatMap((plan) => plan.countedBy === "ambiguous" ? [{ label: `قسط ${plan.title} الشهري`, value: plan.monthlyAmount }] : [
          { label: `قسط ${plan.title} الشهري`, value: plan.monthlyAmount },
          {
            label: `أقساط ${plan.title} الفاضلة`,
            value: plan.remaining,
            unit: "count" as const,
          },
          { label: `الفاضل من ${plan.title}`, value: plan.remainingAmount },
        ]),
        extra: {
          plans: plans.map((plan) => ({
            title: plan.title,
            paid: plan.countedBy === "ambiguous" ? null : plan.paid,
            of: plan.totalInstallments,
            counted: plan.countedBy,
          })),
        },
        coverage: !plans.length
          ? "مفيش خطط أقساط متسجلة في التطبيق."
          : plans.every((plan) => plan.countedBy === "linked")
            ? "محسوبة من الدفعات اللي المستخدم ربطها بمواعيد القسط، والدفعة الجزئية محسوبة بمبلغها."
            : "الخطط اللي فيها counted=ambiguous مش معروف دفعاتها تخص أنهي خطة؛ متقولش مبلغ نهائي للباقي. غير كده الدفعات غير المربوطة تقدير من مجموع مبالغ المصاريف الشخصية المطابقة للكلمة، مش عدد العمليات. ربطها بمواعيد القسط أدق.",
      },
      ctx,
      "لحد النهارده",
    );
  }

  if (metric === "season") {
    const season = String(args.season ?? "");
    if (!(SEASONS as readonly string[]).includes(season)) {
      return {
        response: {
          ok: false,
          error: "missing_season",
          say: "اسأل عن أنهي موسم: رمضان، العيد، المدارس، الصيف.",
        },
      };
    }
    const year = num(args.year);
    const spending = await ctx.app.season(
      ctx.identity,
      season,
      year && year > 2000 ? Math.floor(year) : undefined,
    );
    if (!spending)
      return {
        response: {
          ok: false,
          error: "unknown_season",
          say: "مش لاقي مواعيد الموسم ده في السنة دي. قول كده.",
        },
      };
    return outcome(
      {
        title: `${spending.label}`,
        facts: [
          { label: `صرف ${spending.label}`, value: spending.total },
          ...(spending.previous
            ? [
                {
                  label: `نفس الموسم السنة اللي قبلها`,
                  value: spending.previous.total,
                },
              ]
            : []),
          ...spending.byCategory.slice(0, 3).map((row) => ({
            label: categoryName(row.category),
            value: row.amount,
          })),
        ],
        extra: { from: spending.startDay, to: spending.endDay },
        coverage: spending.count ? undefined : EMPTY_NOTE,
      },
      ctx,
      `${spending.label} (${spending.startDay} لـ ${spending.endDay})`,
    );
  }

  if (metric === "pending") {
    // Two kinds wait, and are said apart: words the classifier needs an answer about, and bank messages already read
    // that wait for a yes. A bank message is never recorded again from words: it is confirmed as it is.
    const [pending, bank] = await Promise.all([
      readPendingQuestions(ctx.identity),
      // A reader that fails, or throws before it starts, is said as unreadable, never as "none waiting".
      (async () => ctx.app.bankSuggestions(ctx.identity))().catch(() => null),
    ]);
    ctx.ledger.nextBatch();
    const bankItems = (bank ?? []).slice(0, 3).map((item) => {
      const fact = ctx.ledger.add({
        id: `bank_${item.id}`,
        label: item.what || item.category,
        value: item.amount,
        source: "ledger",
        exact: true,
      });
      return {
        bank_id: item.id,
        what: item.what || item.category,
        say: fact.say,
        category: item.category,
        day: item.day,
        incoming: item.direction === "incoming",
      };
    });
    return {
      response: {
        ok: true,
        count: pending.count,
        waiting: pending.items,
        bank_count: bank ? bank.length : null,
        bank_waiting: bankItems,
        say: [
          pending.count
            ? "فيه عمليات ماتسجلتش لسه عشان ناقصها تفصيلة: لو الوقت مناسب اسأل سؤال أول واحدة، ولما يرد نادي record_draft بردّه في words ومعاه clarification_id."
            : "مفيش حاجة مستنية توضيح.",
          bank === null
            ? "مش قادر أقرا رسايل البنك المستنية دلوقتي؛ قول كده لو اتسأل."
            : bank.length
              ? ctx.coach
                ? "وفيه رسايل بنك اتقرت ومستنية موافقته: دي بتتأكد زي ما هي (change_draft bank_confirm أو bank_dismiss بالـbank_id)، متسجلهاش تاني بـrecord_draft عشان ماتتسجلش مرتين."
                : "وفيه رسايل بنك اتقرت ومستنية موافقته: بتتأكد من الكارت في الرئيسية أو صفحة الربط البنكي، متسجلهاش تاني بـrecord_draft عشان ماتتسجلش مرتين."
              : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    };
  }

  if (metric === "compare") {
    const before = comparableBefore(input, finance);
    // A category compares that category ("الأكل الشهر ده والشهر اللي فات"), never the whole ledger under its name.
    const [now, then] = category
      ? await Promise.all([
          getCategoryTotal(finance, category, input),
          getCategoryTotal(finance, category, before.input),
        ])
      : await Promise.all([
          getFinanceSummary(finance, input),
          getFinanceSummary(finance, before.input),
        ]);
    const currentValue = income ? now.totalIncome : now.totalExpense;
    const previousValue = income ? then.totalIncome : then.totalExpense;
    const change =
      previousValue > 0
        ? Math.round(((currentValue - previousValue) / previousValue) * 100)
        : null;
    return outcome(
      {
        title: category
          ? `مقارنة ${category}`
          : income
            ? "مقارنة الدخل"
            : "مقارنة المصروف",
        facts: [
          { label: label, value: currentValue },
          { label: before.label, value: previousValue },
          { label: "الفرق", value: Math.abs(currentValue - previousValue) },
        ],
        extra: {
          direction:
            currentValue > previousValue
              ? "more"
              : currentValue < previousValue
                ? "less"
                : "same",
          change: change === null ? null : spellPercent(Math.abs(change)),
        },
        coverage:
          now.transactionCount === 0 || then.transactionCount === 0
            ? EMPTY_NOTE
            : undefined,
      },
      ctx,
      `${label} مقارنة بـ ${before.label}`,
    );
  }

  if (metric === "breakdown") {
    // Inside one category, "where did it go" is its subcategories: grouped by category it is one line of itself.
    const asked = String(args.group_by);
    const granularity = (
      ["category", "sub_category", "day", "week", "month", "merchant"].includes(
        asked,
      )
        ? asked === "category" && category
          ? "sub_category"
          : asked
        : category
          ? "sub_category"
          : "category"
    ) as FinanceGranularity;
    const breakdown = await getFinanceBreakdown(finance, {
      ...input,
      category,
      granularity,
      limit,
    });
    // Entries without a shop come back as "unknown", which the call would read out in English; a subcategory stored as a
    // registry id is said by its Arabic name.
    const items = breakdown.items.slice(0, limit).map((item) => ({
      ...item,
      name:
        item.name === "unknown"
          ? "من غير اسم محل"
          : granularity === "sub_category"
            ? item.name === "general"
              ? "عام"
              : (subCategoryName(category, item.name) ?? item.name)
            : item.name,
    }));
    return outcome(
      {
        title: "المصروف موزّع إزاي",
        facts: [
          { label: "الإجمالي", value: breakdown.totalExpense },
          ...items.map((item) => ({ label: item.name, value: item.amount })),
        ],
        extra: {
          shares: items.map((item) => ({
            name: item.name,
            share: spellPercent(item.percent),
          })),
        },
        coverage: breakdown.partial
          ? PARTIAL_NOTE
          : breakdown.items.length
            ? undefined
            : EMPTY_NOTE,
      },
      ctx,
      label,
    );
  }

  // A question about a person is answered whole, whatever metric the model picked ("خالد اداني كام؟" came as
  // transactions of type income and returned the salary): what came from them, what went to them, and the loan
  // standing with them, which is neither income nor spending.
  if (person && (metric === "transactions" || metric === "total")) {
    const [total, standing] = await Promise.all([
      getPersonTotal(finance, person, input),
      business
        ? Promise.resolve(null)
        : ctx.app.debts(ctx.identity).catch(() => null),
    ]);
    const key = (name: string) =>
      name.replace(/\s+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
    const loan = standing?.people.find(
      (entry) =>
        key(entry.name) === key(total?.name ?? person) ||
        key(entry.name).includes(key(person)),
    );
    const facts = [
      ...(total && total.totalIncome
        ? [
            {
              label: `اللي جالك من ${total.name} كدخل`,
              value: total.totalIncome,
            },
          ]
        : []),
      ...(total && total.totalExpense
        ? [{ label: `اللي اتدفع لـ${total.name}`, value: total.totalExpense }]
        : []),
      ...(loan && loan.balance
        ? [
            {
              label:
                loan.balance > 0
                  ? `${loan.name} عليه ليك (سلف)`
                  : `إنت عليك لـ${loan.name} (سلف)`,
              value: Math.abs(loan.balance),
            },
          ]
        : []),
    ];
    return outcome(
      {
        title: `فلوس ${person}`,
        facts,
        extra: {
          ...(total
            ? {
                income_count: total.incomeCount,
                spent_count: total.expenseCount,
              }
            : {}),
          ...(loan ? { loan_since: loan.lastDate } : {}),
        },
        coverage:
          !total && !loan
            ? `مفيش حد متسجل باسم «${person}».`
            : facts.length === 0
              ? `مفيش فلوس متسجلة مع ${total?.name ?? person} في ${label}.`
              : loan
                ? "السلفة مش دخل ولا مصروف: قولها كسلف (مين عليه لمين)، والدخل والمصروف بفترتهم."
                : undefined,
      },
      ctx,
      label,
    );
  }

  if (metric === "transactions") {
    const amount = num(args.amount);
    if (search || amount !== undefined) {
      const match = await findTransaction(
        finance,
        input,
        search,
        category,
        amount,
        income ? ["income"] : undefined,
      );
      const described = [search, amount !== undefined ? `${amount} جنيه` : ""]
        .filter(Boolean)
        .join(" ");
      return outcome(
        {
          title: `آخر عملية لـ ${described}`,
          facts: match
            ? [
                {
                  label: match.description || categoryName(match.category),
                  value: match.amount,
                  exact: true,
                },
              ]
            : [],
          extra: match
            ? {
                date: match.date,
                category: categoryName(match.category, match.subCategory),
              }
            : {},
          coverage: match
            ? undefined
            : `مالقيتش عملية زي «${described}» في ${label}.`,
        },
        ctx,
        label,
      );
    }
    const list = await getFinanceTransactions(finance, {
      ...input,
      category,
      limit,
      transactionTypes: income ? ["income"] : ["expense"],
    });
    return outcome(
      {
        title: "آخر العمليات",
        facts: list.transactions.slice(0, limit).map((tx) => ({
          label: tx.description || categoryName(tx.category),
          value: tx.amount,
          exact: true,
        })),
        extra: {
          dates: list.transactions.slice(0, limit).map((tx) => tx.date),
          total_matched: list.totalMatched,
        },
        coverage: list.transactions.length ? undefined : EMPTY_NOTE,
      },
      ctx,
      label,
    );
  }

  // total
  if (person) {
    const total = await getPersonTotal(finance, person, input);
    // Money from a person ("دخل من أحمد") is their income rows, never what was paid to them.
    const facts = !total
      ? []
      : income
        ? [{ label: `اللي جالك من ${total.name}`, value: total.totalIncome }]
        : [{ label: `اللي اتدفع لـ${total.name}`, value: total.totalExpense }];
    const count = total ? (income ? total.incomeCount : total.expenseCount) : 0;
    return outcome(
      {
        title: `فلوس ${person}`,
        facts,
        extra: total ? { count } : {},
        coverage: !total
          ? `مفيش حد متسجل باسم «${person}».`
          : count === 0
            ? `مفيش ${income ? "دخل" : "مصروف"} متسجل مربوط بـ${total.name} في ${label}.`
            : undefined,
      },
      ctx,
      label,
    );
  }
  if (search) {
    const total = await getTextSpendingTotal(finance, search, input);
    return outcome(
      {
        title: `المصروف على ${search}`,
        facts: total.transactionCount
          ? [{ label: `المصروف على ${search}`, value: total.totalExpense }]
          : [],
        extra: total.transactionCount
          ? {
              count: total.transactionCount,
              places: total.places.map((place) => place.name),
            }
          : {},
        coverage: total.partial
          ? PARTIAL_NOTE
          : total.transactionCount
            ? undefined
            : `مالقيتش صرف باسم «${search}» في ${label}.`,
      },
      ctx,
      label,
    );
  }
  if (category) {
    const total = await getCategoryTotal(finance, category, input);
    const value = income ? total.totalIncome : total.totalExpense;
    return outcome(
      {
        title: `${category}`,
        facts: [
          { label: income ? `دخل ${category}` : `مصروف ${category}`, value },
        ],
        extra: {
          count: total.transactionCount,
          top: total.topSubCategories
            .map((sub) => subCategoryName(category, sub.name))
            .filter(Boolean)
            .slice(0, 3),
        },
        coverage: total.partial
          ? PARTIAL_NOTE
          : total.transactionCount
            ? undefined
            : EMPTY_NOTE,
      },
      ctx,
      label,
    );
  }
  const summary = await getFinanceSummary(finance, input);
  return outcome(
    {
      title: income ? "الدخل" : "المصروف",
      facts: income
        ? [{ label: `دخل ${label}`, value: summary.totalIncome }]
        : [
            { label: `مصروف ${label}`, value: summary.totalExpense },
            ...(summary.period.daysTotal > 1
              ? [
                  {
                    label: "متوسط اليوم",
                    value: Math.round(summary.dailyAverageExpense),
                  },
                ]
              : []),
          ],
      extra: { count: summary.transactionCount },
      coverage: summary.transactionCount ? undefined : EMPTY_NOTE,
    },
    ctx,
    label,
  );
}

/**
 * The coach call's money_query: the same tool, with what is due and free until payday (commitments) and the agreed
 * plan's progress (plan).
 */
export const moneyQueryCoach: VoiceTool = {
  declaration: {
    name: "money_query",
    description:
      "The user's own records, one question per call: total, breakdown, compare (same days before), drivers, transactions, " +
      "why (how one was classified), includes, report (a month's written report), feasibility, balance (with when each was " +
      "entered), budgets, goals, pending, debts, installments, season, commitments (what is due and free until payday, " +
      "expected income apart), plan (the agreed plan and how it is going). Facts carry a ref for calculate.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: [...METRICS, ...COACH_METRICS] },
        period: {
          type: "string",
          enum: [...PERIODS],
          description:
            "Default this_month (the salary cycle when there is a salary day).",
        },
        from: { type: "string", description: "YYYY-MM-DD, with period custom" },
        to: { type: "string", description: "YYYY-MM-DD, with period custom" },
        category: {
          type: "string",
          description: "Category in the user's words, e.g. أكل, مواصلات",
        },
        person: { type: "string", description: "A person's name" },
        search: { type: "string", description: "Merchant or word, e.g. طلبات" },
        type: { type: "string", enum: ["expense", "income"] },
        group_by: {
          type: "string",
          enum: [
            "category",
            "sub_category",
            "day",
            "week",
            "month",
            "merchant",
          ],
          description: "With a category, default sub_category",
        },
        limit: { type: "integer" },
        month: { type: "string", description: "YYYY-MM, for report" },
        season: { type: "string", enum: [...SEASONS] },
        year: { type: "integer" },
        amount: {
          type: "number",
          description:
            "EGP: for feasibility, or to find a transaction by its amount",
        },
        scope: {
          type: "string",
          enum: ["personal", "business"],
          description:
            "business: their business's own ledger (totals, breakdowns, comparisons, transactions)",
        },
      },
      required: ["metric"],
    },
  },
  run,
};

export const moneyQuery: VoiceTool = {
  declaration: {
    name: "money_query",
    description:
      "The user's own records, one question per call: total, breakdown, compare (same days before), drivers (what " +
      "changed), transactions, why (how a transaction was classified; needs search), includes (what a category " +
      "counts), report (a month's written report; month), feasibility (can they afford amount), balance, budgets, " +
      "goals, pending (entries waiting for their answer), debts (who owes whom, the gam3eya), installments, season " +
      "(Ramadan, the Eids, school, summer). Facts carry a ref for calculate. Say numbers as the 'say' forms.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: [...METRICS] },
        period: {
          type: "string",
          enum: [...PERIODS],
          description:
            "Default this_month (the salary cycle when there is a salary day).",
        },
        from: { type: "string", description: "YYYY-MM-DD, with period custom" },
        to: { type: "string", description: "YYYY-MM-DD, with period custom" },
        category: {
          type: "string",
          description: "Category in the user's words, e.g. أكل, مواصلات",
        },
        person: { type: "string", description: "A person's name" },
        search: { type: "string", description: "Merchant or word, e.g. طلبات" },
        type: { type: "string", enum: ["expense", "income"] },
        group_by: {
          type: "string",
          enum: ["category", "day", "week", "month", "merchant"],
        },
        limit: { type: "integer" },
        month: {
          type: "string",
          description: "YYYY-MM, for report; default last month",
        },
        season: {
          type: "string",
          enum: [...SEASONS],
          description: "For season",
        },
        year: {
          type: "integer",
          description: "For season; default the latest one",
        },
        amount: {
          type: "number",
          description:
            "EGP: for feasibility, or to find a transaction by its amount (why, transactions)",
        },
        scope: {
          type: "string",
          enum: ["personal", "business"],
          description:
            "business: their business's own ledger (totals, breakdowns, comparisons, transactions)",
        },
      },
      required: ["metric"],
    },
  },
  run,
};
