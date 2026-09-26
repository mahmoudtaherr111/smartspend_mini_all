import type { JsonObject } from "./protocol";
import type { LabTurn } from "./session";

export const LAB_INSTRUCTION = `إنت سمارت في تجربة اصطناعية لمكالمة مالية مصرية.
اتكلم مصري طبيعي. كل رقم مالي لازم ييجي من أداة في المكالمة دي. فرّق بين المسجل والمعروف والناقص.
ماتوعدش بميزة غير لما تتأكد من capabilities_check. خطوات التطبيق من guide_search فقط.
الكتابة محتاجة مسودة وموافقة على نفس المسودة ونتيجة تنفيذ مؤكدة. الأدوات المتاحة هنا للقراءة فقط، مفيش أداة تنفيذ.
اسأل عن الرصيد والالتزامات لو ناقصين قبل رأي في قدرة الشراء. اسمع الضيق الأول من غير لوم.
ماتجمعش سن ولا نوع، وماتخزنش تصنيف نفسي. مفيش أرقام حساسة في التحية. إنت حر في صياغة الرد.`;

export const LAB_TOOLS: JsonObject[] = [
  { name: "money_query", description: "حقايق الدفتر الاصطناعي. اطلبها لكل رقم مالي.", parameters: {
    type: "OBJECT", properties: {
      metric: { type: "STRING", enum: ["total", "breakdown", "compare", "balance", "bills"] },
      period: { type: "STRING", enum: ["today", "yesterday", "this_month", "last_month", "last_year", "salary_cycle"] },
    }, required: ["metric", "period"],
  } },
  { name: "guide_search", description: "دليل التطبيق المعتمد في التجربة", parameters: {
    type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"],
  } },
  { name: "capabilities_check", description: "المميزات الموجودة فعلا في التجربة", parameters: {
    type: "OBJECT", properties: { feature: { type: "STRING" } }, required: ["feature"],
  } },
];

export const MEASUREMENT_TURNS: LabTurn[] = [
  { id: "greeting", text: "إزيك يا سمارت" },
  { id: "today", text: "صرفت كام النهارده؟" },
  { id: "yesterday", text: "طب وامبارح؟" },
  { id: "compare", text: "قارن مصاريف الشهر ده بالشهر اللي فات" },
  { id: "afford", text: "أقدر أشتري موبايل بخمستاشر ألف؟" },
  { id: "guide", text: "إزاي أربط رسايل البنك؟" },
  { id: "vent", text: "أنا مخنوق من المصاريف ومش عارف أبدأ منين" },
  { id: "record", text: "دفعت خمسين مواصلات وسبعين أكل، سجلهم" },
  { id: "correction", text: "لا الأكل كان ميتين وخمسين، متسجلش لسه" },
  { id: "close-day", text: "نقفل اليوم ونراجع اللي اتسجل من رسايل البنك" },
];

export function answerLabTool(name: string, args: JsonObject): JsonObject {
  if (name === "capabilities_check") return { available: false, reason: "هذه تجربة قراءة فقط، لا تنفيذ ولا ربط بنكي فعلي" };
  if (name === "guide_search") return { source: "synthetic_guide_fixture", steps: ["افتح صفحة رسايل البنك في التطبيق", "راجع تعليمات ربط تطبيق الإشعارات المعروضة هناك"], destination: "/sms" };
  if (name !== "money_query") return { error: "unknown_tool", executed: false };
  const data: Record<string, { value: number; spoken: string }> = {
    today: { value: 320, spoken: "تلتمية وعشرين جنيه" },
    yesterday: { value: 250, spoken: "ميتين وخمسين جنيه" },
    this_month: { value: 8400, spoken: "تمن آلاف وربعمية جنيه" },
    last_month: { value: 7000, spoken: "سبع آلاف جنيه" },
    last_year: { value: 75000, spoken: "خمسة وسبعين ألف جنيه" },
    salary_cycle: { value: 8400, spoken: "تمن آلاف وربعمية جنيه" },
  };
  if (args.metric === "balance" || args.metric === "bills") {
    return { facts: [], coverage: { complete: false, missing: ["confirmed_balance", "commitments"] } };
  }
  if (args.metric !== "total" && args.metric !== "compare") return { error: "unsupported_fixture_metric", facts: [] };
  const periods = args.metric === "compare" ? ["this_month", "last_month"] : [String(args.period)];
  if (periods.some(period => !data[period])) return { error: "invalid_fixture_period", facts: [] };
  return { facts: periods.map(period => ({ key: period, value: data[period].value, unit: "EGP",
    source: "synthetic_ledger_fixture", asOf: "2026-09-22T12:00:00Z", spoken: data[period].spoken })),
    coverage: { complete: false, missing: ["unrecorded_cash"] }, card: { type: "summary" } };
}
