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

// ─── Tool Implementations ───

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

async function get_app_guide(ctx: ToolContext, _args: ToolArgs) {
  return `
  دليل استخدام SmartSpend السريع:
  - إضافة مصروف/دخل: من الصفحة الرئيسية، اضغط على زر الإضافة (+) العائم.
  - تعديل الميزانية: من القائمة الجانبية (أو صفحة الإعدادات) اختر "البروفايل المالي" وعدل ميزانيتك.
  - إدارة المحافظ (بنوك/كاش): اذهب إلى قسم "المحافظ" لإضافة أو تعديل رصيد حساباتك.
  - مصاريف الأصدقاء والديون: لسهولة التتبع، يمكنك إضافة المصروف وتحديد اسم الصديق في خانة "الوصف"، أو استخدام ميزة "جهات الاتصال" إذا كانت متاحة.
  - التقارير والإحصائيات: تجدها في قسم "التقارير" وتظهر لك رسوماً بيانية تفصيلية.
  - أهداف الادخار: من قسم "الأهداف" يمكنك إنشاء هدف وتتبع مدى اقترابك منه.
  `;
}

// ─── Tool Executor & Compressor ───

const TOOL_EXECUTORS: Record<string, (ctx: ToolContext, args: ToolArgs) => Promise<unknown>> = {
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

/**
 * Converts a Javascript object/array into a compact text format to save Tokens.
 */
function compressToText(obj: any): string {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "No data";
    if (typeof obj[0] === "object" && obj[0] !== null) {
      const keys = Object.keys(obj[0]);
      const header = keys.join(" | ");
      const rows = obj.map(item => keys.map(k => String(item[k] ?? "")).join(" | "));
      return [header, ...rows].join("\n");
    }
    return obj.join(", ");
  }
  
  let result = "";
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result += `\n[${key}]\n` + compressToText(value) + "\n";
    } else if (typeof value === "object" && value !== null) {
      result += `\n[${key}]\n` + Object.entries(value).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n";
    } else {
      result += `${key}: ${value}\n`;
    }
  }
  return result.trim();
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
    return JSON.stringify({ error: `Tool "${name}" not found` });
  }
  try {
    const result = await executor(ctx, args);
    // Compress the output to text/CSV instead of verbose JSON
    return compressToText(result);
  } catch (error: any) {
    console.error(`[AI Chat Tool] Error executing ${name}:`, error.message);
    return `Error executing ${name}: ${error.message}`;
  }
}

// ─── Tool Definitions (OpenAI Format) ───

export const TOOL_DEFINITIONS: ToolDefinition[] = [
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
