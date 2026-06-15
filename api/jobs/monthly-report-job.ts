import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, localUsers, systemSettings } from "../../db/schema";
import { whatsappService } from "../services/whatsapp-service";
import { getSmartProfile } from "../services/user-profile-service";
import { processAIChatMessage } from "../services/ai-chat-service";

/**
 * Monthly Report Cron Job (Agentic Workflow)
 *
 * Runs automatically, fetches PRO users, uses the DeepSeek Agentic RAG
 * to generate a comprehensive, personalized monthly report by pulling data dynamically
 * through function calls, then sends the final report via WhatsApp.
 */
export async function runMonthlyReportJob(targetMonth?: string) {
  console.log("[MonthlyReportJob] Starting execution...");

  const db = getDb();
  const month = targetMonth || new Date().toISOString().slice(0, 7);

  try {
    // 1. Fetch system config for the AI
    const settingsRows = await db.select().from(systemSettings);
    const s: Record<string, string> = {};
    settingsRows.forEach((r) => {
      if (r.key && r.value) s[r.key] = r.value;
    });

    const aiConfig = {
      apiKey: s.chatbot_api_key || s.fireworks_api_key || "",
      baseUrl: s.chatbot_base_url || "https://api.fireworks.ai/inference/v1",
      model: s.chatbot_model || "accounts/fireworks/models/deepseek-v4-flash",
      maxTokens: parseInt(s.chatbot_max_tokens_ultra || "5000"), // High limit for report
      maxHistory: 0,
    };

    if (!aiConfig.apiKey) {
      console.error("[MonthlyReportJob] Missing AI API Key. Aborting.");
      return;
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

      console.log(`[MonthlyReportJob] Generating Agentic Report for user ${u.id}...`);

      const agentPrompt = `الرجاء إنشاء تقرير مالي شهري شامل لشهر ${month}. 
استخدم الأدوات المتاحة لجلب:
1. ملخص الشهر الحالي (المصاريف، الدخل)
2. تقسيم مصاريفي حسب الفئات
3. مقارنة سريعة مع الشهر الماضي
ثم اكتب رسالة احترافية جداً ومشجعة ومناسبة للإرسال عبر واتساب للمستخدم (ابدأ بـ "أهلاً يا [اسمي]").
ركز على اكتشاف أي مصاريف غير عادية (Anomaly) وقدم نصيحة واحدة قوية لتحسين هدفي المالي.
اكتب رسالة الواتساب وتكون مقسمة ومنسقة باستخدام النجوم (*bold*).`;

      let reportContent = "";
      
      try {
        const aiResult = await processAIChatMessage({
          userId: u.id,
          userType,
          userPlan: "pro",
          message: agentPrompt,
          conversationHistory: [],
          config: aiConfig,
        });
        
        reportContent = aiResult.response;
        console.log(`[MonthlyReportJob] Used ${aiResult.tokensUsed} tokens for user ${u.id}. Tools used: ${aiResult.toolsUsed.join(", ")}`);
      } catch (err: any) {
        console.error(`[MonthlyReportJob] AI Error for user ${u.id}:`, err.message);
        // Fallback message
        reportContent = `🌟 *تقريرك الشهري من SmartSpend* 🌟\n\nأهلاً بك!\nتم تجهيز ملخص شهر ${month}. يرجى فتح التطبيق للاطلاع على التفاصيل.`;
      }

      // 4. Send via WhatsApp
      await whatsappService.sendMessage(targetPhone, reportContent);
      console.log(`[MonthlyReportJob] Sent report to user ${u.id} at ${targetPhone}`);
    }

    console.log("[MonthlyReportJob] Finished successfully.");
  } catch (err) {
    console.error("[MonthlyReportJob] Error executing job:", err);
  }
}
