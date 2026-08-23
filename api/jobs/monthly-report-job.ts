import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, localUsers, systemSettings, monthlyReports } from "../../db/schema";
import { whatsappService } from "../services/whatsapp-service";
import { getSmartProfile } from "../services/user-profile-service";
import { buildMonthlyReportFactsPack } from "../services/finance-semantic-layer";
import { recordAICostMetric, resolveAICostPolicy } from "../services/ai-cost-policy";
import { callFireworksAPI } from "../lib/fireworks-client";

export const MONTHLY_REPORT_CACHE_VERSION = "semantic_report_v2";

export interface MonthlyReportJobOptions {
  month?: string;
  forceRefresh?: boolean;
  sendWhatsApp?: boolean;
}

type ExistingMonthlyReport = {
  id: number;
  aiReport: string | null;
  insights: string | null;
};

function parseReportMetadata(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function isMonthlyReportCacheValid(
  row: ExistingMonthlyReport | undefined,
  cacheVersion = MONTHLY_REPORT_CACHE_VERSION,
): boolean {
  if (!row?.aiReport?.trim()) return false;
  const metadata = parseReportMetadata(row.insights);
  return metadata.cacheVersion === cacheVersion;
}

function valueOfFact(
  facts: Awaited<ReturnType<typeof buildMonthlyReportFactsPack>>["facts"],
  label: string,
): string | number | boolean | null {
  return facts.find((fact) => fact.label === label)?.value ?? null;
}

function numberFact(
  facts: Awaited<ReturnType<typeof buildMonthlyReportFactsPack>>["facts"],
  label: string,
): number {
  const value = valueOfFact(facts, label);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTopCategories(value: unknown): Array<{ category: string; amount: number }> {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split("|")
    .map((part) => {
      const [rawName, rawRest] = part.trim().split(":");
      const amount = Number(String(rawRest ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? 0);
      return {
        category: (rawName || "غير مصنف").trim(),
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter((item) => item.category);
}

function fallbackReportText(input: {
  userName: string;
  month: string;
  factsBlock: string;
  totalIncome: number;
  totalExpense: number;
  netFlow: number;
  topCategories: Array<{ category: string; amount: number }>;
}): string {
  const topLine =
    input.topCategories.length > 0
      ? input.topCategories
          .slice(0, 3)
          .map((item) => `${item.category}: ${Math.round(item.amount)} ج`)
          .join("، ")
      : "لا توجد فئات كافية للتحليل";

  return [
    `أهلاً يا ${input.userName}، ده ملخصك المالي لشهر ${input.month}.`,
    `إجمالي الدخل: ${Math.round(input.totalIncome)} ج، إجمالي المصاريف: ${Math.round(input.totalExpense)} ج، والصافي: ${Math.round(input.netFlow)} ج.`,
    `أعلى الفئات: ${topLine}.`,
    input.netFlow >= 0
      ? "وضعك العام إيجابي. حافظ على نفس الإيقاع وحاول تخصص جزء واضح للادخار قبل بداية الشهر."
      : "الصافي سلبي هذا الشهر. أهم خطوة عملية هي تحديد سقف للفئات الأعلى ومراجعته أسبوعيا.",
    "",
    "حقائق التقرير:",
    input.factsBlock,
  ].join("\n");
}

function parseReportText(raw: string): string {
  const trimmed = raw.trim().replace(/```json?/g, "").replace(/```/g, "").trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const responseText = parsed.response_text ?? parsed.report ?? parsed.text;
    return typeof responseText === "string" ? responseText.trim() : trimmed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return trimmed;
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const responseText = parsed.response_text ?? parsed.report ?? parsed.text;
      return typeof responseText === "string" ? responseText.trim() : trimmed;
    } catch {
      return trimmed;
    }
  }
}

/**
 * Monthly Report Cron Job (Agentic Workflow)
 *
 * Runs automatically, fetches PRO users, uses the DeepSeek Agentic RAG
 * to generate a comprehensive, personalized monthly report by pulling data dynamically
 * through function calls, then sends the final report via WhatsApp.
 */
export async function runMonthlyReportJob(targetMonth?: string | MonthlyReportJobOptions) {
  console.log("[MonthlyReportJob] Starting execution...");

  const db = getDb();
  const options: MonthlyReportJobOptions =
    typeof targetMonth === "string" ? { month: targetMonth } : targetMonth ?? {};
  const month = options.month || new Date().toISOString().slice(0, 7);
  const forceRefresh = options.forceRefresh === true;
  const sendWhatsApp = options.sendWhatsApp !== false;

  try {
    // 1. Fetch system config for the AI
    const { getSystemSettings } = await import("../lib/settings-cache");
    const settings = await getSystemSettings();
    const s: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      if (value) s[key] = value;
    }
    const reportPolicy = resolveAICostPolicy({
      channel: "report",
      plan: "pro",
      intentKind: "report_request",
      settings: s,
    });

    const aiConfig = {
      apiKey: s.chatbot_api_key || s.fireworks_api_key || "",
      baseUrl: s.chatbot_base_url || "https://api.fireworks.ai/inference/v1",
      model: s.chatbot_model || "accounts/fireworks/models/deepseek-v4-flash",
      maxTokens: Math.min(parseInt(s.chatbot_max_tokens_ultra || "5000"), reportPolicy.maxOutputTokens),
      maxHistory: 0,
      maxToolRounds: reportPolicy.maxToolRounds,
    };

    if (!aiConfig.apiKey) {
      console.warn("[MonthlyReportJob] Missing AI API Key. Deterministic fallback reports will be used.");
    }

    // 2. Fetch all PRO users
    const proOauthUsers = await db.query.users.findMany({
      where: eq(users.plan, "pro"),
    });

    const proLocalUsers = await db.query.localUsers.findMany({
      where: eq(localUsers.plan, "pro"),
    });

    console.log(
      `[MonthlyReportJob] Found ${proOauthUsers.length + proLocalUsers.length} Pro users.`
    );

    // 3. Process each user via Agentic Workflow
    for (const u of [...proOauthUsers, ...proLocalUsers]) {
      const isLocal = "phone" in u;
      const userType = isLocal ? "local" : "oauth";

      let targetPhone = isLocal ? (u as any).phone : null;
      const profile = await getSmartProfile(u.id, userType);

      if (!targetPhone && profile.basicInfo.phone) {
        targetPhone = profile.basicInfo.phone;
      }

      if (!targetPhone) {
        console.warn(`[MonthlyReportJob] Skipping user ${u.id} - No phone number.`);
        continue;
      }

      // Check if user has WhatsApp sending enabled (future setting)
      // if (profile.preferences.disable_whatsapp_report) continue;

      console.log(`[MonthlyReportJob] Preparing semantic report for user ${u.id}...`);
      const reportStartedAt = Date.now();

      const [cachedReport] = await db
        .select()
        .from(monthlyReports)
        .where(
          and(
            eq(monthlyReports.userId, u.id),
            eq(monthlyReports.userType, userType),
            eq(monthlyReports.month, month),
          ),
        )
        .limit(1);

      let reportContent =
        !forceRefresh && isMonthlyReportCacheValid(cachedReport as ExistingMonthlyReport | undefined)
          ? cachedReport.aiReport ?? ""
          : "";

      let reportSource = reportContent ? "monthly_report_cache" : "monthly_report_semantic_facts";

      if (reportContent) {
        console.log(`[MonthlyReportJob] Reusing cached report for user ${u.id}, month ${month}.`);
      }

      try {
        if (!reportContent) {
          const factsPack = await buildMonthlyReportFactsPack(
            { userId: u.id, userType },
            month,
            {
              forceLive: forceRefresh,
              skipCache: forceRefresh,
            },
          );
          const facts = factsPack.facts;
          const totalIncome = numberFact(facts, "total_income");
          const totalExpense = numberFact(facts, "total_expense");
          const netFlow = numberFact(facts, "net_flow");
          const dailyAverage = numberFact(facts, "daily_average_expense");
          const topCategories = parseTopCategories(valueOfFact(facts, "top_categories"));
          const userName = String((u as any).name || profile.basicInfo.name || "صديقنا");

          if (aiConfig.apiKey) {
            const systemPrompt =
              "أنت مستشار مالي مصري. اكتب تقرير واتساب شهري مختصر ودقيق. لا تخترع أي رقم خارج الحقائق.";
            const userPrompt = [
              `اكتب تقرير مالي لشهر ${month} للمستخدم ${userName}.`,
              "استخدم الحقائق التالية فقط. لا تستخدم أدوات ولا تطلب بيانات إضافية.",
              factsPack.factsBlock,
              "",
              'Output JSON فقط: {"response_text":"..."}',
            ].join("\n");

            const aiResult = await callFireworksAPI(
              aiConfig.apiKey,
              aiConfig.model,
              systemPrompt,
              userPrompt,
              aiConfig.maxTokens,
            );
            reportContent = parseReportText(aiResult.text);
            reportSource = "monthly_report_semantic_llm";

            const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 3.5);
            void recordAICostMetric({
              userId: u.id,
              userType,
              channel: "report",
              plan: "pro",
              intentKind: "report_request",
              model: aiConfig.model,
              inputTokens: estimatedInputTokens,
              outputTokens: Math.max(0, aiResult.tokensUsed - estimatedInputTokens),
              totalTokens: aiResult.tokensUsed,
              llmCalls: 1,
              toolCalls: 0,
              latencyMs: Date.now() - reportStartedAt,
              metadata: {
                month,
                source: reportSource,
                factsSource: factsPack.source,
                factsCacheKey: factsPack.cacheKey,
                maxOutputTokens: aiConfig.maxTokens,
                cacheVersion: MONTHLY_REPORT_CACHE_VERSION,
                forceRefresh,
                cachedPromptTokens: aiResult.cachedTokens ?? 0,
              },
            });
            console.log(`[MonthlyReportJob] Used ${aiResult.tokensUsed} tokens for user ${u.id}.`);
          }

          if (!reportContent) {
            reportContent = fallbackReportText({
              userName,
              month,
              factsBlock: factsPack.factsBlock,
              totalIncome,
              totalExpense,
              netFlow,
              topCategories,
            });
            reportSource = "monthly_report_deterministic_fallback";
          }

          const metadata = JSON.stringify({
            cacheVersion: MONTHLY_REPORT_CACHE_VERSION,
            source: reportSource,
            factsSource: factsPack.source,
            factsCacheKey: factsPack.cacheKey,
            generatedAt: new Date().toISOString(),
            forceRefresh,
          });

          const reportRow = {
            userId: u.id,
            userType,
            month,
            totalAmount: totalExpense.toFixed(2),
            totalIncome: totalIncome.toFixed(2),
            categoryBreakdown: topCategories,
            topCategories,
            dailyAverage: dailyAverage.toFixed(2),
            highestDay: null,
            insights: metadata,
            aiReport: reportContent,
          };

          if (cachedReport?.id) {
            await db
              .update(monthlyReports)
              .set(reportRow)
              .where(eq(monthlyReports.id, cachedReport.id));
          } else {
            await db.insert(monthlyReports).values(reportRow);
          }
        }
      } catch (err: any) {
        console.error(`[MonthlyReportJob] Report generation error for user ${u.id}:`, err.message);
        // Fallback message
        reportContent = `🌟 *تقريرك الشهري من SmartSpend* 🌟\n\nأهلاً بك!\nتم تجهيز ملخص شهر ${month}. يرجى فتح التطبيق للاطلاع على التفاصيل.`;
      }

      // 4. Send via WhatsApp
      if (sendWhatsApp) {
        await whatsappService.sendMessage(targetPhone, reportContent);
        console.log(`[MonthlyReportJob] Sent report to user ${u.id} at ${targetPhone}`);
      } else {
        console.log(`[MonthlyReportJob] Generated report for user ${u.id}; WhatsApp send skipped.`);
      }
    }

    console.log("[MonthlyReportJob] Finished successfully.");
  } catch (err) {
    console.error("[MonthlyReportJob] Error executing job:", err);
  }
}
