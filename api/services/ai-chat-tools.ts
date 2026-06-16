/**
 * AI Chat Tools — Function Calling Definitions & Implementations
 *
 * All original tools are preserved to maintain "guided paths" for the AI.
 * Token burn is combated via auto-CSV conversion of tool outputs in executeTool().
 */

import { db } from "../queries/connection";
import {
  expenses,
  userWallets,
  financialGoals,
  userContacts,
} from "../../db/schema";
import { eq, and, gte, lte, desc, like } from "drizzle-orm";
import type { ToolDefinition } from "../lib/deepseek-client";
import type { DataNeed, DataNeedKind, PeriodHint } from "./ai-kernel/types";
import { resolveKernelDataNeeds } from "./finance-semantic-layer";

// ─── Helper ───
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfMonth(month?: string, salaryDay: number = 1): Date {
  let year: number;
  let m: number;
  if (month) {
    const parts = month.split("-");
    year = parseInt(parts[0]);
    m = parseInt(parts[1]) - 1; // 0-indexed month
  } else {
    const d = new Date();
    year = d.getFullYear();
    m = d.getMonth();
    if (d.getDate() < salaryDay) {
      m -= 1;
    }
  }
  return new Date(year, m, salaryDay, 0, 0, 0, 0);
}
function endOfMonth(month?: string, salaryDay: number = 1): Date {
  const start = startOfMonth(month, salaryDay);
  // The cycle ends on the day BEFORE the next salary day.
  const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1, 23, 59, 59, 999);
  return end;
}

type ToolArgs = Record<string, unknown>;
type ToolContext = { userId: number; userType: string; salaryDay?: number };
type DataNeedScope = NonNullable<DataNeed["scope"]>;

const FINANCE_QUERY_KINDS = [
  "summary",
  "wallet_summary",
  "period_comparison",
  "category_total",
  "breakdown",
  "transactions",
  "chart",
  "goal_progress",
] as const;

type FinanceQueryKind = (typeof FINANCE_QUERY_KINDS)[number];

const PERIOD_HINTS: PeriodHint[] = [
  "today",
  "yesterday",
  "current_week",
  "current_month",
  "previous_month",
  "salary_cycle",
  "custom",
];

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function periodFrom(value: unknown, fallback: PeriodHint): PeriodHint {
  const period = asString(value);
  return period && PERIOD_HINTS.includes(period as PeriodHint) ? (period as PeriodHint) : fallback;
}

function makeFinanceNeed(
  index: number,
  kind: DataNeedKind,
  reason: string,
  scope: DataNeed["scope"] = {},
  maxRows?: number,
): DataNeed {
  return {
    id: `legacy_finance_${index}_${kind.replace(".", "_")}`,
    kind,
    priority: maxRows && maxRows > 8 ? "deep" : "hot",
    reason,
    scope,
    maxRows,
    cache: {
      keyHint: ["legacy_finance", kind, scope.period, scope.category, scope.granularity, scope.limit]
        .filter(Boolean)
        .join(":"),
      ttlSeconds: 60,
      hot: true,
    },
  };
}

function buildFinanceQueryNeeds(args: ToolArgs): DataNeed[] {
  const kind = FINANCE_QUERY_KINDS.includes(args.kind as FinanceQueryKind)
    ? (args.kind as FinanceQueryKind)
    : "summary";
  const period = periodFrom(args.period, kind === "summary" ? "today" : "current_month");
  const category = asString(args.category);
  const query = asString(args.query) ?? asString(args.search_query);
  const startDate = asString(args.start_date) ?? asString(args.startDate);
  const endDate = asString(args.end_date) ?? asString(args.endDate);
  const limit = clampLimit(args.limit, kind === "transactions" ? 8 : 6, 20);
  const granularity = asString(args.granularity) as DataNeedScope["granularity"] | undefined;
  const baseScope: DataNeed["scope"] = {
    period,
    category,
    query,
    startDate,
    endDate,
  };

  if (kind === "wallet_summary") {
    return [makeFinanceNeed(1, "wallet.summary", "legacy_wallet_summary", {}, 8)];
  }

  if (kind === "period_comparison") {
    return [
      makeFinanceNeed(
        1,
        "finance.period_comparison",
        "legacy_period_comparison",
        { ...baseScope, comparePeriod: period === "previous_month" ? "current_month" : "previous_month" },
        2,
      ),
    ];
  }

  if (kind === "category_total") {
    return category
      ? [
          makeFinanceNeed(
            1,
            "finance.category_total",
            "legacy_exact_category_total",
            baseScope,
            1,
          ),
          makeFinanceNeed(
            2,
            "finance.transactions",
            "legacy_category_evidence",
            { ...baseScope, limit: Math.min(limit, 5) },
            Math.min(limit, 5),
          ),
        ]
      : [makeFinanceNeed(1, "finance.summary", "legacy_category_missing_fallback_summary", baseScope, 1)];
  }

  if (kind === "breakdown") {
    return [
      makeFinanceNeed(
        1,
        "finance.breakdown",
        "legacy_grouped_breakdown",
        { ...baseScope, granularity: granularity ?? "category", limit },
        limit,
      ),
    ];
  }

  if (kind === "transactions") {
    return [
      makeFinanceNeed(
        1,
        "finance.transactions",
        "legacy_supporting_transactions",
        { ...baseScope, limit },
        limit,
      ),
    ];
  }

  if (kind === "chart") {
    return [
      makeFinanceNeed(
        1,
        "chart.data",
        "legacy_chart_dataset",
        { ...baseScope, granularity: granularity ?? "category", limit },
        limit,
      ),
    ];
  }

  if (kind === "goal_progress") {
    return [makeFinanceNeed(1, "goals.active", "legacy_goal_progress", {}, 5)];
  }

  return [makeFinanceNeed(1, "finance.summary", "legacy_top_level_summary", baseScope, 1)];
}

// ─── Tool Implementations ───

async function finance_query(ctx: ToolContext, args: ToolArgs) {
  const dataNeeds = buildFinanceQueryNeeds(args);
  const result = await resolveKernelDataNeeds(
    {
      userId: ctx.userId,
      userType: ctx.userType,
      salaryDay: ctx.salaryDay,
    },
    dataNeeds,
  );

  return {
    contract: "finance.query.v1",
    dataNeeds,
    facts: result.facts.slice(0, 30),
    artifacts: result.artifacts.slice(0, 4),
    errors: result.errors,
    cacheHits: result.cacheHits,
    guidance:
      "Answer only from facts. If a number is not present in facts, say it is unavailable instead of guessing.",
  };
}

async function get_today_expenses(ctx: ToolContext, _args: ToolArgs) {
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        gte(expenses.date, startOfToday()),
        lte(expenses.date, endOfToday()),
      ),
    )
    .orderBy(desc(expenses.date));

  const totalExpense = rows
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalIncome = rows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + Number(r.amount), 0);

  return {
    total_expense: totalExpense,
    total_income: totalIncome,
    count: rows.length,
    items: rows.slice(0, 20).map((r) => ({
      description: r.description || r.category,
      amount: Number(r.amount),
      category: r.category,
      type: r.type,
    })),
  };
}

async function get_month_summary(ctx: ToolContext, args: ToolArgs) {
  const month = (args.month as string) || new Date().toISOString().slice(0, 7);
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        gte(expenses.date, startOfMonth(month)),
        lte(expenses.date, endOfMonth(month)),
      ),
    );

  const totalExpense = rows
    .filter((r) => r.type === "expense")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalIncome = rows
    .filter((r) => r.type === "income")
    .reduce((s, r) => s + Number(r.amount), 0);

  const daysInMonth = endOfMonth(month).getDate();
  const daysPassed = month === new Date().toISOString().slice(0, 7)
    ? new Date().getDate()
    : daysInMonth;

  return {
    month,
    total_expense: totalExpense,
    total_income: totalIncome,
    net_flow: totalIncome - totalExpense,
    transaction_count: rows.length,
    daily_average: daysPassed > 0 ? Math.round(totalExpense / daysPassed) : 0,
    days_passed: daysPassed,
    days_in_month: daysInMonth,
  };
}

async function get_category_breakdown(ctx: ToolContext, args: ToolArgs) {
  const month = (args.month as string) || new Date().toISOString().slice(0, 7);
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, startOfMonth(month)),
        lte(expenses.date, endOfMonth(month)),
      ),
    );

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byCategory: Record<string, number> = {};
  rows.forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount);
  });

  const sorted = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({
      name,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));

  return { month, total, categories: sorted.slice(0, 10) };
}

async function get_recent_transactions(ctx: ToolContext, args: ToolArgs) {
  const count = Math.min(Number(args.count) || 10, 30);
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
      ),
    )
    .orderBy(desc(expenses.date))
    .limit(count);

  return {
    transactions: rows.map((r) => ({
      description: r.description || r.category,
      amount: Number(r.amount),
      category: r.category,
      sub_category: r.subCategory,
      type: r.type,
      date: r.date ? new Date(r.date).toLocaleDateString("ar-EG") : "",
    })),
  };
}

async function get_spending_by_person(ctx: ToolContext, args: ToolArgs) {
  const name = (args.name as string) || "";
  if (!name) return { error: "محتاج اسم الشخص" };

  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        like(expenses.description, `%${name}%`),
      ),
    )
    .orderBy(desc(expenses.date))
    .limit(20);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return {
    person: name,
    total_amount: total,
    transaction_count: rows.length,
    recent: rows.slice(0, 5).map((r) => ({
      description: r.description,
      amount: Number(r.amount),
      date: r.date ? new Date(r.date).toLocaleDateString("ar-EG") : "",
      category: r.category,
    })),
  };
}

async function get_family_spending(ctx: ToolContext, _args: ToolArgs) {
  const familyCategories = ["أولاد", "تعليم", "أسرة"];
  const familyKeywords = ["ابن", "ابنة", "بنت", "ولد", "أولاد", "مدرسة", "حضانة", "تعليم", "أسرة"];

  const month = new Date().toISOString().slice(0, 7);
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, startOfMonth(month)),
        lte(expenses.date, endOfMonth(month)),
      ),
    );

  const familyExpenses = rows.filter(
    (r) =>
      familyCategories.some((c) => r.category.includes(c) || (r.subCategory || "").includes(c)) ||
      familyKeywords.some((kw) => (r.description || "").includes(kw)),
  );

  const total = familyExpenses.reduce((s, r) => s + Number(r.amount), 0);
  return {
    total_family_spending: total,
    count: familyExpenses.length,
    breakdown: familyExpenses.slice(0, 10).map((r) => ({
      description: r.description || r.category,
      amount: Number(r.amount),
      category: r.category,
    })),
  };
}

async function get_wallet_balances(ctx: ToolContext, _args: ToolArgs) {
  const wallets = await db
    .select()
    .from(userWallets)
    .where(
      and(
        eq(userWallets.userId, ctx.userId),
        eq(userWallets.userType, ctx.userType),
      ),
    );

  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  return {
    total_balance: totalBalance,
    wallets: wallets.map((w) => ({
      name: w.name,
      provider: w.provider,
      balance: Number(w.balance || 0),
      last_four: w.lastFourDigits,
    })),
  };
}

async function get_financial_goals(ctx: ToolContext, _args: ToolArgs) {
  const goals = await db
    .select()
    .from(financialGoals)
    .where(
      and(
        eq(financialGoals.userId, ctx.userId),
        eq(financialGoals.userType, ctx.userType),
      ),
    );

  return {
    goals: goals.map((g) => ({
      title: g.title,
      target_amount: Number(g.targetAmount || 0),
      status: g.status,
      description: g.description,
    })),
  };
}

async function get_previous_month_comparison(ctx: ToolContext, _args: ToolArgs) {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  const [currentRows, prevRows] = await Promise.all([
    db.select().from(expenses).where(
      and(
        eq(expenses.userId, ctx.userId), eq(expenses.userType, ctx.userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, startOfMonth(currentMonth)), lte(expenses.date, endOfMonth(currentMonth)),
      ),
    ),
    db.select().from(expenses).where(
      and(
        eq(expenses.userId, ctx.userId), eq(expenses.userType, ctx.userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, startOfMonth(prevMonth)), lte(expenses.date, endOfMonth(prevMonth)),
      ),
    ),
  ]);

  const currentTotal = currentRows.reduce((s, r) => s + Number(r.amount), 0);
  const prevTotal = prevRows.reduce((s, r) => s + Number(r.amount), 0);
  const changePercent = prevTotal > 0
    ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100)
    : 0;

  return {
    current_month: currentMonth,
    current_total: currentTotal,
    previous_month: prevMonth,
    previous_total: prevTotal,
    change_percent: changePercent,
    direction: changePercent > 0 ? "زيادة" : changePercent < 0 ? "نقصان" : "ثابت",
  };
}

async function get_daily_average(ctx: ToolContext, _args: ToolArgs) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId), eq(expenses.userType, ctx.userType),
        eq(expenses.type, "expense"),
        gte(expenses.date, startOfMonth(month)), lte(expenses.date, endOfMonth(month)),
      ),
    );

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const daysPassed = Math.max(1, new Date().getDate());
  const daysInMonth = endOfMonth(month).getDate();
  const projected = Math.round((total / daysPassed) * daysInMonth);

  return {
    daily_average: Math.round(total / daysPassed),
    total_so_far: total,
    days_passed: daysPassed,
    projected_monthly_total: projected,
  };
}

async function get_spending_by_date_range(ctx: ToolContext, args: ToolArgs) {
  const startDate = args.start_date ? new Date(args.start_date as string) : startOfMonth();
  const endDate = args.end_date ? new Date(args.end_date as string) : endOfToday();

  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId), eq(expenses.userType, ctx.userType),
        gte(expenses.date, startDate), lte(expenses.date, endDate),
      ),
    );

  const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + Number(r.amount), 0);
  const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount), 0);

  return {
    start_date: startDate.toLocaleDateString("ar-EG"),
    end_date: endDate.toLocaleDateString("ar-EG"),
    total_expense: totalExpense,
    total_income: totalIncome,
    transaction_count: rows.length,
  };
}

async function search_transactions(ctx: ToolContext, args: ToolArgs) {
  const query = (args.query as string) || "";
  if (!query) return { error: "محتاج كلمة للبحث" };

  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, ctx.userId),
        eq(expenses.userType, ctx.userType),
        like(expenses.description, `%${query}%`),
      ),
    )
    .orderBy(desc(expenses.date))
    .limit(15);

  return {
    query,
    results_count: rows.length,
    results: rows.map((r) => ({
      description: r.description,
      amount: Number(r.amount),
      category: r.category,
      type: r.type,
      date: r.date ? new Date(r.date).toLocaleDateString("ar-EG") : "",
    })),
  };
}

/**
 * Super Tool: Analyze Finances (Added for Deep Analytical Queries)
 */
async function analyze_finances(ctx: ToolContext, args: ToolArgs) {
  let conditions = [
    eq(expenses.userId, ctx.userId),
    eq(expenses.userType, ctx.userType),
  ];

  if (args.start_date) conditions.push(gte(expenses.date, new Date(args.start_date as string)));
  if (args.end_date) {
    const ed = new Date(args.end_date as string);
    ed.setHours(23, 59, 59, 999);
    conditions.push(lte(expenses.date, ed));
  }
  if (args.type) conditions.push(eq(expenses.type, args.type as "income" | "expense"));
  if (args.category) conditions.push(like(expenses.category, `%${args.category}%`));
  if (args.search_query) conditions.push(like(expenses.description, `%${args.search_query}%`));

  const limit = Math.min(Number(args.limit) || 30, 50);

  const rows = await db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.date));

  let totalIncome = 0;
  let totalExpense = 0;
  rows.forEach(r => {
    if (r.type === "income") totalIncome += Number(r.amount);
    else totalExpense += Number(r.amount);
  });

  const summary = { totalIncome, totalExpense, netFlow: totalIncome - totalExpense };

  if (args.group_by === "category") {
    const grouped: Record<string, number> = {};
    rows.forEach(r => {
      const cat = r.category || "أخرى";
      grouped[cat] = (grouped[cat] || 0) + Number(r.amount);
    });
    return { summary, category_breakdown: grouped };
  } else if (args.group_by === "month") {
    const grouped: Record<string, number> = {};
    rows.forEach(r => {
      if (!r.date) return;
      const m = r.date.toISOString().slice(0, 7);
      grouped[m] = (grouped[m] || 0) + Number(r.amount);
    });
    return { summary, monthly_breakdown: grouped };
  } else {
    return { summary, rows: rows.slice(0, limit).map(r => ({ date: r.date, type: r.type, amount: r.amount, category: r.category, description: r.description })) };
  }
}

async function get_app_guide(_ctx: ToolContext, _args: ToolArgs) {
  return {
    contract: "site.guide.v1",
    topic: "smartspend_usage",
    summary: "دليل استخدام SmartSpend السريع",
    sections: [
      {
        id: "expense_capture",
        title: "إضافة مصروف أو دخل",
        steps: ["من الصفحة الرئيسية اضغط على زر الإضافة العائم.", "اكتب الوصف والمبلغ وراجع التصنيف قبل الحفظ."],
      },
      {
        id: "financial_profile",
        title: "تعديل الميزانية",
        steps: ["افتح القائمة الجانبية أو صفحة الإعدادات.", "اختر البروفايل المالي وعدل دخلك أو ميزانيتك."],
      },
      {
        id: "wallets",
        title: "إدارة المحافظ",
        steps: ["افتح قسم المحافظ.", "أضف محفظة أو حسابا بنكيا واكتب الرصيد واسم المزود."],
      },
      {
        id: "sms_cards",
        title: "ربط رسائل SMS أو بطاقة",
        steps: [
          "فعّل إذن قراءة رسائل SMS المالية من إعدادات الربط.",
          "اربط الرسائل بالحساب أو المحفظة المناسبة.",
          "للبطاقة، احفظ اسم البنك وآخر أربعة أرقام فقط ولا تدخل بيانات البطاقة الكاملة.",
        ],
      },
      {
        id: "contacts_debts",
        title: "مصاريف الأصدقاء والديون",
        steps: [
          "اكتب اسم الشخص في وصف المصروف لتتبعه بسهولة.",
          "استخدم جهات الاتصال إذا كانت متاحة في حسابك.",
        ],
      },
      {
        id: "reports_goals",
        title: "التقارير والأهداف",
        steps: [
          "افتح قسم التقارير لمتابعة الرسوم والتحليلات.",
          "من قسم الأهداف يمكنك إنشاء هدف ادخار ومتابعة الخطة.",
        ],
      },
    ],
  };
}

// ─── Tool Executor ───

const TOOL_EXECUTORS: Record<string, (ctx: ToolContext, args: ToolArgs) => Promise<unknown>> = {
  finance_query,
  get_today_expenses,
  get_month_summary,
  get_category_breakdown,
  get_recent_transactions,
  get_spending_by_person,
  get_family_spending,
  get_wallet_balances,
  get_financial_goals,
  get_previous_month_comparison,
  get_daily_average,
  get_spending_by_date_range,
  search_transactions,
  analyze_finances,
  get_app_guide,
};

function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

/**
 * Execute a tool by name with given arguments.
 */
export async function executeTool(
  name: string,
  args: ToolArgs,
  ctx: ToolContext,
): Promise<string> {
  const executor = TOOL_EXECUTORS[name];
  if (!executor) {
    return compactJson({ ok: false, tool: name, error: `Tool "${name}" not found` });
  }
  try {
    const result = await executor(ctx, args);
    return compactJson({ ok: true, tool: name, result });
  } catch (error: any) {
    console.error(`[AI Chat Tool] Error executing ${name}:`, error.message);
    return compactJson({
      ok: false,
      tool: name,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Tool Definitions (OpenAI Format) ───

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "finance_query",
      description:
        "الأداة المالية الأساسية المفضلة. ترجع JSON منظم من Finance Semantic Layer بأقل facts مطلوبة فقط: ملخص، فئة، معاملات، مقارنة، أرصدة محافظ، أهداف، أو بيانات رسم.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: FINANCE_QUERY_KINDS,
            description:
              "summary, wallet_summary, period_comparison, category_total, breakdown, transactions, chart, or goal_progress",
          },
          period: {
            type: "string",
            enum: PERIOD_HINTS,
            description: "today, yesterday, current_week, current_month, previous_month, salary_cycle, or custom",
          },
          category: { type: "string", description: "Optional canonical category such as food or transport." },
          query: { type: "string", description: "Optional exact search query for transaction evidence." },
          start_date: { type: "string", description: "YYYY-MM-DD for custom periods." },
          end_date: { type: "string", description: "YYYY-MM-DD for custom periods." },
          granularity: {
            type: "string",
            enum: ["day", "week", "month", "category", "merchant"],
            description: "Grouping for breakdowns or charts.",
          },
          limit: { type: "number", description: "Maximum rows/points. Keep small." },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_today_expenses",
      description: "جلب مصاريف ودخل اليوم بالتفصيل",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_month_summary",
      description: "ملخص الشهر: إجمالي المصاريف والدخل والصافي ومتوسط الصرف اليومي",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "الشهر بصيغة YYYY-MM (اختياري، الافتراضي الشهر الحالي)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_breakdown",
      description: "تفصيل المصاريف حسب الفئة مع النسب المئوية",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "الشهر بصيغة YYYY-MM (اختياري)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_transactions",
      description: "آخر المعاملات المسجلة بالتفصيل",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "عدد المعاملات (الافتراضي 10، الأقصى 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_person",
      description: "المبالغ المحوّلة أو المصروفة على شخص معيّن",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "اسم الشخص" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_family_spending",
      description: "مصاريف الأسرة والأولاد والتعليم هذا الشهر",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_balances",
      description: "أرصدة كل المحافظ والحسابات",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_goals",
      description: "أهداف الادخار النشطة والتقدم فيها",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_previous_month_comparison",
      description: "مقارنة مصاريف الشهر الحالي بالشهر السابق",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_average",
      description: "متوسط الصرف اليومي والتوقعات لنهاية الشهر",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_spending_by_date_range",
      description: "مصاريف فترة زمنية محددة",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "تاريخ البداية (YYYY-MM-DD)" },
          end_date: { type: "string", description: "تاريخ النهاية (YYYY-MM-DD)" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "بحث في المعاملات بكلمة أو وصف معيّن",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "كلمة البحث" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_finances",
      description: "أداة إضافية قوية للتحليل المعقد. استخدمها للأسئلة المعقدة التي تحتاج بحث مخصص لا تغطيه الأدوات السابقة.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "تاريخ البداية (YYYY-MM-DD)" },
          end_date: { type: "string", description: "تاريخ النهاية (YYYY-MM-DD)" },
          type: { type: "string", enum: ["income", "expense"] },
          category: { type: "string" },
          search_query: { type: "string" },
          group_by: { type: "string", enum: ["category", "month"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_guide",
      description: "دليل استخدام التطبيق وكيفية إضافة مصاريف أو ميزانية أو محفظة، استخدمها للرد على أسئلة حول كيفية عمل التطبيق",
      parameters: { type: "object", properties: {} },
    },
  },
];
