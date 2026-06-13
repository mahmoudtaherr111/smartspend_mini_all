import { eq, and } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, localUsers, userProfiles } from "../../db/schema";
import { whatsappService } from "../services/whatsapp-service";
import { getSmartProfile } from "../services/user-profile-service";

/**
 * Monthly Report Cron Job
 *
 * This job is designed to run automatically at the end of every month.
 * It queries all active PRO users, generates their monthly financial summary,
 * and sends it directly to their WhatsApp.
 */
export async function runMonthlyReportJob(targetMonth?: string) {
  console.log("[MonthlyReportJob] Starting execution...");

  const db = getDb();

  // Calculate the target month if not provided (e.g. "2024-05")
  const month = targetMonth || new Date().toISOString().slice(0, 7);

  try {
    // 1. Fetch all PRO users (assuming 'pro' plan is what qualifies)
    const proOauthUsers = await db.query.users.findMany({
      where: eq(users.plan, "pro"),
    });

    const proLocalUsers = await db.query.localUsers.findMany({
      where: eq(localUsers.plan, "pro"),
    });

    console.log(
      `[MonthlyReportJob] Found ${proOauthUsers.length + proLocalUsers.length} Pro users.`,
    );

    // 2. Process each user (could be batched for scale)
    for (const u of [...proOauthUsers, ...proLocalUsers]) {
      const isLocal = "phone" in u;
      const userType = isLocal ? "local" : "oauth";

      // We need a phone number to send WhatsApp
      const phone = isLocal ? (u as any).phone : null;
      // Note: For OAuth users, we would fetch phone from userProfiles.basicInfo
      let targetPhone = phone;

      const profile = await getSmartProfile(u.id, userType);

      if (!targetPhone && profile.basicInfo.phone) {
        targetPhone = profile.basicInfo.phone;
      }

      if (!targetPhone) {
        console.warn(
          `[MonthlyReportJob] Skipping user ${u.id} - No phone number found.`,
        );
        continue;
      }

      // 3. Generate the summary
      // In production, this would use the Batch AI Pipeline for massive scale
      // For now, we simulate fetching the compiled report
      const reportContent = `🌟 *تقريرك الشهري من SmartSpend* 🌟
      
أهلاً ${u.name}!
لقد قمنا بتحليل مصروفاتك لشهر ${month}. 

📊 *ملخص سريع:*
- أنت منضبط في ميزانيتك.
- تم تحقيق 80% من هدفك المالي.

للاطلاع على التقرير المفصل، افتح التطبيق:
https://smartspend.ai/dashboard

شكراً لثقتك بنا! 🚀`;

      // 4. Send via WhatsApp
      await whatsappService.sendMessage(targetPhone, reportContent);

      console.log(
        `[MonthlyReportJob] Sent report to user ${u.id} at ${targetPhone}`,
      );
    }

    console.log("[MonthlyReportJob] Finished successfully.");
  } catch (err) {
    console.error("[MonthlyReportJob] Error executing job:", err);
  }
}
