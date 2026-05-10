import { z } from "zod";
import { router, authedProcedure, proProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./queries/connection";
import { expenses, monthlyReports, aiSummaries } from "../db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { env } from "./lib/env";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const MODELS = {
  flash: "gemini-1.5-flash",
  pro: "gemini-1.5-pro",
  ultra: "gemini-1.0-ultra",
  gemma: "gemma-3-27b-it",
};

// ─── Hybrid Parser (from P2) ───
function hybridParse(text: string) {
  const incomeKeywords = ["خدت", "جالي", "مرتب", "أرباح", "مكافأة", "عمولة", "حصلت", "استلمت"];
  const expenseKeywords = ["صرفت", "دفعت", "اشتريت", "ركبت", "أكلت", "فاتورة", "شرحت", "حولت"];

  const items: Array<{ amount: number; category: string; description: string; type: "income" | "expense" }> = [];

  // Extract amounts with categories
  const regex = /(\d+(?:\.\d+)?)\s*(جنيه|ج| pound|egp)?/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const amount = parseFloat(match[1]);
    const before = text.substring(Math.max(0, match.index - 50), match.index);

    const isIncome = incomeKeywords.some(k => before.includes(k));
    const isExpense = expenseKeywords.some(k => before.includes(k));
    const type = isIncome && !isExpense ? "income" : "expense";

    // Detect category from context
    let category = "متنوعات";
    const catMap: Record<string, string> = {
      "أكل": "أكل وشرب", "فاكهة": "أكل وشرب", "مطعم": "أكل وشرب",
      "مواصلات": "مواصلات", "أجرة": "مواصلات", "تكسي": "مواصلات", "أوبر": "مواصلات",
      "فاتورة": "فواتير", "كهربا": "فواتير", "مية": "فواتير", "نت": "فواتير",
      "مرتب": "دخل", "أرباح": "دخل", "مكافأة": "دخل",
      "تسوق": "تسوق", "ملابس": "تسوق", "هدايا": "تسوق",
      "صحة": "صحة", "دكتور": "صحة", "دوا": "صحة",
      "تعليم": "تعليم", "كورس": "تعليم", "كتاب": "تعليم",
      "ترفيه": "ترفيه", "سينما": "ترفيه", "لعبة": "ترفيه",
    };

    for (const [key, val] of Object.entries(catMap)) {
      if (before.includes(key) || text.substring(match.index, match.index + 30).includes(key)) {
        category = val;
        break;
      }
    }

    items.push({ amount, category, description: before.trim().slice(-20) || text.slice(match.index, match.index + 20), type });
  }

  return items.length > 0 ? items : null;
}

async function aiParse(text: string, model: string) {
  const aiModel = genAI.getGenerativeModel({ model });
  const prompt = `حلل النص المصري ده واطلع مصاريف/دخل منظمة بصيغة JSON:
[{"amount": رقم, "category": "فئة", "description": "وصف", "type": "income|expense"}]
النص: "${text}"
رد بـ JSON فقط.`;

  const result = await aiModel.generateContent(prompt);
  const response = result.response.text();

  const stripCodeFences = (s: string) => s.replace(/```json?/g, "").replace(/```/g, "").trim();

  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s);
      return Array.isArray(j) ? j : (j && (j.expenses || j.items)) || null;
    } catch {
      return null;
    }
  };

  const cleaned = stripCodeFences(response);

  // 1) direct parse
  let parsed = tryParse(cleaned);
  if (parsed) return parsed;

  // 2) extract first JSON object/array block
  const blockMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (blockMatch && blockMatch[0]) {
    parsed = tryParse(blockMatch[0]);
    if (parsed) return parsed;
  }

  // 3) try to remove any leading junk before the first brace/bracket and progressively trim trailing junk
  const firstIdx = cleaned.search(/[\{\[]/);
  if (firstIdx !== -1) {
    const substr = cleaned.slice(firstIdx);
    for (let end = substr.length; end > 0; end--) {
      const attempt = substr.slice(0, end);
      parsed = tryParse(attempt);
      if (parsed) return parsed;
    }
  }

  // 4) last resort: strip any leading non-brace characters and try once
  const fallback = cleaned.replace(/^[^\{\[]*/g, "");
  parsed = tryParse(fallback);
  if (parsed) return parsed;

  // Log a truncated snapshot for debugging (avoid leaking long secrets)
  try {
    console.error("aiParse: failed to parse AI response as JSON. snippet:", cleaned.slice(0, 1000));
  } catch {}

  return [];
}

export const aiRouter = router({
  // ─── Parse Expense (Hybrid) ───
  parseExpense: authedProcedure
    .input(z.object({ text: z.string(), model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash") }))
    .mutation(async ({ ctx, input }) => {
      // Check plan limits
      if (ctx.user.plan !== "pro") {
        const today = new Date(); today.setHours(0,0,0,0);
        const todayUsage = await db.select({ count: sql`COUNT(*)` }).from(aiSummaries)
          .where(and(eq(aiSummaries.userId, ctx.user.id), eq(aiSummaries.userType, ctx.user.type), gte(aiSummaries.createdAt, today)));
        if ((todayUsage[0]?.count as number ?? 0) >= 10) {
          throw new TRPCError({ code: "FORBIDDEN", message: "وصلت للحد اليومي. حدث لبرو!" });
        }
      }

      // Try hybrid first
      let items = hybridParse(input.text);
      const modelName = MODELS[input.model];

      // Fallback to AI if hybrid fails or for complex text
      if (!items || items.length === 0 || input.text.length > 100) {
        items = await aiParse(input.text, modelName);
      }

      // Cache usage
      await db.insert(aiSummaries).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        period: "daily",
        periodValue: new Date().toISOString().split("T")[0],
        model: modelName,
        content: JSON.stringify(items),
      }).catch(() => {});

      return { items, model: modelName, parsedBy: items && items.length > 0 ? "hybrid" : "ai" };
    }),

  // ─── Generate Monthly Insights ───
  generateMonthlyInsights: authedProcedure
    .input(z.object({
      month: z.string(), // YYYY-MM
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
    }))
    .mutation(async ({ ctx, input }) => {
      const modelName = MODELS[input.model];

      // Check cache
      const cached = await db.select().from(aiSummaries)
        .where(and(
          eq(aiSummaries.userId, ctx.user.id),
          eq(aiSummaries.userType, ctx.user.type),
          eq(aiSummaries.period, "monthly"),
          eq(aiSummaries.periodValue, input.month),
          eq(aiSummaries.model, modelName)
        )).limit(1);

      if (cached[0] && new Date(cached[0].createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
        return { insights: cached[0].content, cached: true, model: modelName };
      }

      const [year, month] = input.month.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);

      const userExpenses = await db.select().from(expenses)
        .where(and(
          eq(expenses.userId, ctx.user.id),
          eq(expenses.userType, ctx.user.type),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate)
        ));

      if (userExpenses.length === 0) {
        return { insights: "مفيش مصاريف الشهر ده. ابدأ تسجل!", cached: false, model: modelName };
      }

      const total = userExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const byCategory = userExpenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
        return acc;
      }, {} as Record<string, number>);

      const aiModel = genAI.getGenerativeModel({ model: modelName });
      const prompt = `حلل بيانات مصاريف الشهر ده بالعامية المصرية:
إجمالي: ${total} جنيه
الفئات: ${Object.entries(byCategory).map(([k, v]) => `${k}: ${v}`).join(", ")}
اعمل تحليل مالي مختصر ونصائح باللهجة المصرية.`;

      const result = await aiModel.generateContent(prompt);
      const insights = result.response.text();

      await db.insert(aiSummaries).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        period: "monthly",
        periodValue: input.month,
        model: modelName,
        content: insights,
      }).catch(() => {});

      return { insights, cached: false, model: modelName };
    }),

  // ─── Compare Months ───
  compareMonths: authedProcedure
    .input(z.object({
      month1: z.string(),
      month2: z.string(),
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("flash"),
    }))
    .mutation(async ({ ctx, input }) => {
      const modelName = MODELS[input.model];
      const aiModel = genAI.getGenerativeModel({ model: modelName });

      const getMonthData = async (monthStr: string) => {
        const [y, m] = monthStr.split("-");
        const start = new Date(parseInt(y), parseInt(m) - 1, 1);
        const end = new Date(parseInt(y), parseInt(m), 0);
        const exps = await db.select().from(expenses)
          .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, start), lte(expenses.date, end)));
        return { total: exps.reduce((s, e) => s + Number(e.amount), 0), count: exps.length };
      };

      const d1 = await getMonthData(input.month1);
      const d2 = await getMonthData(input.month2);

      const prompt = `قارن بين شهرين ماليا بالعامية المصرية:
${input.month1}: ${d1.total} جنيه (${d1.count} عملية)
${input.month2}: ${d2.total} جنيه (${d2.count} عملية)
اعمل مقارنة مختصرة.`;

      const result = await aiModel.generateContent(prompt);
      return { comparison: result.response.text(), model: modelName, data: { month1: d1, month2: d2 } };
    }),

  // ─── Generate Yearly Insights ───
  generateYearlyInsights: authedProcedure
    .input(z.object({
      year: z.string(),
      model: z.enum(["flash", "pro", "ultra", "gemma"]).default("pro"),
    }))
    .mutation(async ({ ctx, input }) => {
      const modelName = MODELS[input.model];
      const aiModel = genAI.getGenerativeModel({ model: modelName });

      const start = new Date(parseInt(input.year), 0, 1);
      const end = new Date(parseInt(input.year), 11, 31);
      const exps = await db.select().from(expenses)
        .where(and(eq(expenses.userId, ctx.user.id), eq(expenses.userType, ctx.user.type), gte(expenses.date, start), lte(expenses.date, end)));

      const total = exps.reduce((s, e) => s + Number(e.amount), 0);
      const byMonth = exps.reduce((acc, e) => {
        const m = e.date.getMonth() + 1;
        acc[m] = (acc[m] || 0) + Number(e.amount);
        return acc;
      }, {} as Record<number, number>);

      const prompt = `حلل مصاريف السنة ${input.year} بالعامية المصرية:
إجمالي: ${total} جنيه
الشهور: ${Object.entries(byMonth).map(([k, v]) => `شهر ${k}: ${v}`).join(", ")}
اعمل ملخص سنوي وتوقعات.`;

      const result = await aiModel.generateContent(prompt);
      return { insights: result.response.text(), model: modelName, total };
    }),
});
