import type { BehaviorSnapshotResult } from "./lifestyle-inference-engine";
import type { SmartUserProfile } from "./user-profile-service";
import { buildReportPersonalizationContext } from "./report-personalization-engine";

export interface ProReportBackendSummary {
  month: string;
  totalExpense: number;
  totalIncome: number;
  netFlow: number;
  dailyAvg: number;
  monthlyChangePercent: number;
  topSubCategories: Array<{ name: string; amount: number; percent: number }>;
  alerts: string[];
  personality: string;
  forecast?: string;
  patternMemory?: string;
  recurringBills?: string[];
  transactionCount: number;
}

const GOAL_REPORT_FOCUS: Record<string, string> = {
  save_money: "ركّز على فرص الادخار العملية وخطة تقليل الرفاهيات دون إحراج.",
  reduce_spending: "ركّز على تقليل الصرف غير الضروري مع أرقام مقترحة لكل بند.",
  pay_debt: "ركّز على سداد الديون والأقساط وترتيب الأولويات.",
  organize_expenses: "ركّز على تنظيم الفئات والالتزام بتتبع يومي.",
  track_income: "ركّز على استقرار الدخل وتنويع المصادر.",
  manage_business: "ركّز على تكاليف المشروع والتدفق النقدي.",
};

export function buildProReportDataBlock(
  summary: ProReportBackendSummary,
): string {
  const subs = summary.topSubCategories
    .slice(0, 12)
    .map((s) => `${s.name}: ${s.amount}ج (${s.percent}%)`)
    .join(" | ");

  return [
    `الشهر: ${summary.month}`,
    `إجمالي المصاريف: ${summary.totalExpense} ج.م | الدخل: ${summary.totalIncome} ج.م | الصافي: ${summary.netFlow} ج.م`,
    `تغير المصاريف عن الشهر السابق: ${summary.monthlyChangePercent > 0 ? "+" : ""}${summary.monthlyChangePercent}%`,
    `متوسط يومي: ${summary.dailyAvg} ج.م | عدد العمليات: ${summary.transactionCount}`,
    `الشخصية المالية: ${summary.personality}`,
    `أهم الفئات الفرعية: ${subs}`,
    summary.patternMemory ? `ذاكرة الأنماط: ${summary.patternMemory}` : "",
    summary.recurringBills?.length
      ? `فواتير متوقعة: ${summary.recurringBills.join(" | ")}`
      : "",
    summary.forecast ? `توقع السيولة: ${summary.forecast}` : "",
    summary.alerts.length ? `تنبيهات: ${summary.alerts.join(" — ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildProReportPrompt(input: {
  profile: SmartUserProfile;
  snapshot: BehaviorSnapshotResult;
  summary: ProReportBackendSummary;
  targetWords: number;
  topItemsContext?: string;
}): { systemInstruction: string; userPrompt: string } {
  const goalKey = String(
    input.profile.financialInfo?.primaryGoal || "organize_expenses",
  );
  const goalFocus =
    GOAL_REPORT_FOCUS[goalKey] || GOAL_REPORT_FOCUS.organize_expenses;
  const personalization = buildReportPersonalizationContext(
    input.profile,
    input.snapshot,
  );

  const sectionGuide =
    input.targetWords >= 900
      ? `5 أقسام: (1) ملخص تنفيذي بالأرقام (2) تحليل فئات فرعية (3) سلوك واتجاهات (4) مخاطر وفرص (5) خطة 30 يوم بأرقام`
      : `3 أقسام: (1) ملخص مالي (2) تحليل فئات (3) توصيات عملية`;

  const systemInstruction = `أنت مستشار مالي Pro في SpinSmart — تقارير شهرية بمستوى استشاري.
أسلوب: عربي فصيح معاصر، ضمير "أنت"، أرقام حقيقية من البيانات، بدون عناوين آلية مكررة.
${goalFocus}
الطول المطلوب لـ response_text: حوالي ${input.targetWords} كلمة.
الهيكل: ${sectionGuide}
أضف invoice_header و invoice_footer قصيرين يعطيان إحساس تقرير مالي رسمي (اسم الشهر، SpinSmart Pro).`;

  const userPrompt = `[بيانات الشهر — محسوبة مسبقاً]
${buildProReportDataBlock(input.summary)}
${input.topItemsContext || ""}

${personalization}

[المطلوب JSON فقط]
{
  "response_text": "نص التقرير الكامل",
  "alerts": ["تنبيهات"],
  "personality_flag": "${input.summary.personality}",
  "savings_tips": ["نصيحة 1", "نصيحة 2"],
  "next_month_actions": [{"action":"...","target_amount":0}],
  "invoice_header": "سطر عنوان التقرير",
  "invoice_footer": "سطر ختام",
  "data_table": []
}`;

  return { systemInstruction, userPrompt };
}

export function wrapReportAsPrintableHtml(
  reportJson: Record<string, unknown>,
  month: string,
  userName?: string,
): string {
  const text = String(reportJson.response_text || "").replace(/\n/g, "<br/>");
  const header = String(
    reportJson.invoice_header || `تقرير SpinSmart Pro — ${month}`,
  );
  const footer = String(
    reportJson.invoice_footer || "تم إنشاؤه بواسطة SpinSmart",
  );
  const alerts = Array.isArray(reportJson.alerts)
    ? (reportJson.alerts as string[]).map((a) => `<li>${a}</li>`).join("")
    : "";

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>${header}</title>
<style>
body{font-family:Segoe UI,Tahoma,sans-serif;max-width:720px;margin:24px auto;padding:24px;color:#111}
.header{border-bottom:3px solid #f59e0b;padding-bottom:12px;margin-bottom:20px}
.header h1{font-size:1.35rem;margin:0}
.meta{color:#666;font-size:.9rem}
.content{line-height:1.75;font-size:1rem}
.alerts{background:#fff7ed;border-right:4px solid #f59e0b;padding:12px 16px;margin:20px 0}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:.85rem;color:#666}
@media print{body{margin:0}}
</style></head><body>
<div class="header"><h1>${header}</h1>
<p class="meta">${userName ? `لـ ${userName} · ` : ""}${month}</p></div>
<div class="content">${text}</div>
${alerts ? `<div class="alerts"><strong>تنبيهات</strong><ul>${alerts}</ul></div>` : ""}
<div class="footer">${footer}</div></body></html>`;
}
