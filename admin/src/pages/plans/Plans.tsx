import { useState } from "react";
import { PLAN_FEATURE_DEFAULTS, PLAN_FEATURE_LABELS, planFeatureKey, type PlanFeature } from "@contracts/plan-features";
import { Button } from "@admin/kit/button";
import { SettingsEditor } from "../../ui/SettingsEditor";
import { PageHeader } from "../../ui/states";
import { PlanMatrix, type Row } from "./PlanMatrix";
import { VoiceCall } from "./VoiceCall";

const ALL_ON = { free: true, pro: true, ultra: true };

const FEATURE_HINTS: Record<PlanFeature, string> = {
  receipts: "يصوّر الفاتورة والذكاء الاصطناعي يقراها.",
  business: "دفتر منفصل لشغله، بأرباحه ومصاريفه.",
  pro_report: "تقرير شهري مفصّل يتطبع أو يتبعت.",
  goal_analysis: "الذكاء الاصطناعي يقول الهدف ممكن في قد إيه وإزاي.",
  whatsapp_report: "ملخص الشهر على واتساب أول كل شهر، لو المستخدم سايبه شغال.",
};

const FEATURES: Row[] = [
  { kind: "switch", label: "فهم الجمل بالذكاء الاصطناعي", hint: "لو اتقفل، الجملة بتتفهم بالقواعد والقاموس بس.", key: (plan) => `${plan}_ai_parse`, fallback: ALL_ON },
  { kind: "switch", label: "التحليل الشهري بالذكاء الاصطناعي", hint: "لو اتقفل، المستخدم بياخد التقرير الأساسي اللي التطبيق بيكتبه بنفسه.", key: (plan) => `${plan}_ai_analysis`, fallback: ALL_ON },
  { kind: "switch", label: "الشات", key: (plan) => `chatbot_enabled_${plan}`, fallback: ALL_ON },
  ...(Object.keys(PLAN_FEATURE_DEFAULTS) as PlanFeature[]).map((feature): Row => ({
    kind: "switch",
    label: PLAN_FEATURE_LABELS[feature],
    hint: FEATURE_HINTS[feature],
    key: (plan) => planFeatureKey(feature, plan),
    fallback: PLAN_FEATURE_DEFAULTS[feature],
  })),
];

const AI_LIMITS: Row[] = [
  { kind: "number", label: "توكنز الذكاء في الشهر", hint: "كل القنوات مع بعض. بعدها الذكاء بيقف لحد أول الشهر الجاي.", key: (plan) => `${plan}_token_limit`, unit: "توكن" },
  { kind: "number", label: "جمل بتتفهم بالذكاء في اليوم", key: (plan) => `${plan}_daily_limit`, unit: "جملة" },
  { kind: "number", label: "أطول رد في فهم الجملة", key: (plan) => `${plan}_max_per_request`, unit: "توكن" },
  { kind: "number", label: "طلبات ذكاء في الدقيقة", hint: "حماية من حد بيبعت طلبات ورا بعض.", key: (plan) => `burst_limit_per_minute_${plan}`, unit: "طلب" },
  { kind: "number", label: "رسايل الشات في اليوم", key: (plan) => `chatbot_daily_limit_${plan}`, unit: "رسالة" },
  { kind: "number", label: "أطول رد في الشات", key: (plan) => `chatbot_max_tokens_${plan}`, unit: "توكن" },
  { kind: "number", label: "أطول رد في قراية الفاتورة", hint: "0 = الميزة مقفولة.", key: (plan) => `image_max_tokens_${plan}`, unit: "توكن" },
  { kind: "number", label: "أطول رد في تحليل الهدف", key: (plan) => `goal_max_tokens_${plan}`, unit: "توكن" },
];

const OTHER_LIMITS: Row[] = [
  { kind: "number", label: "ثواني التسجيل الصوتي في الشهر", hint: "المصاريف اللي بتتقال بالصوت. 0 = من غير حد.", key: (plan) => `voice_limit_${plan}`, unit: "ثانية" },
  { kind: "number", label: "أطول تسجيل صوتي", key: (plan) => `voice_per_req_${plan}`, unit: "ثانية" },
  { kind: "number", label: "أيام الانتظار بين تحليلين شهريين", hint: "0 = من غير انتظار.", key: (plan) => `report_limit_${plan}`, unit: "يوم" },
  { kind: "number", label: "طول التحليل الشهري", key: (plan) => `report_words_${plan}`, unit: "كلمة" },
  { kind: "number", label: "أقصى توكنز للتحليل الشهري", key: (plan) => `report_max_tokens_${plan}`, unit: "توكن" },
  { kind: "number", label: "فئات فرعية في التحليل", key: (plan) => `report_subcats_${plan}`, unit: "فئة" },
  { kind: "number", label: "أكبر مصاريف بالاسم في التحليل", key: (plan) => `report_top_items_${plan}`, unit: "عملية", plans: ["pro", "ultra"] },
  { kind: "number", label: "أهداف شغالة في نفس الوقت", hint: "0 = من غير حد.", key: (plan) => `goals_active_limit_${plan}`, unit: "هدف" },
  { kind: "number", label: "عمليات تتسجل من غير نت", hint: "تستنى على الموبايل لحد ما النت يرجع.", key: (plan) => `offline_limit_${plan}`, unit: "عملية" },
  { kind: "number", label: "عمليات من رسايل البنك في الشهر", hint: "بعدها بتتعلق وتتسجل لو اشترك. 0 = من غير حد.", key: (plan) => `capture_monthly_limit_${plan}`, unit: "عملية" },
  { kind: "number", label: "موبايلات بتبعت رسايل البنك", hint: "لكل مستخدم في نفس الوقت.", key: (plan) => `capture_devices_${plan}`, unit: "موبايل" },
];

const TABS = [
  { id: "features", label: "المميزات" },
  { id: "limits", label: "الحدود" },
  { id: "voice", label: "المكالمة الصوتية" },
] as const;

/** What each plan may do and how much of it: one table per kind of setting, saved with the save bar. */
export function Plans() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("features");
  return (
    <div>
      <PageHeader
        title="الباقات والحدود"
        description="كل باقة بتعمل إيه وقد إيه. التغيير بيوصل للتطبيق خلال دقايق، ومش محتاج نسخة جديدة. الأسعار نفسها في المتاجر."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => (
          <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "default" : "outline"} onClick={() => setOpen(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </div>
      <SettingsEditor>
        {(props) => (
          <div className="space-y-4">
            {open === "features" && <PlanMatrix {...props} title="مميزات كل باقة" rows={FEATURES} note="الميزة المقفولة بتختفي من التطبيق أو بتطلب الترقية." />}
            {open === "limits" && (
              <>
                <PlanMatrix {...props} title="حدود الذكاء الاصطناعي" rows={AI_LIMITS} note="التوكن حوالي ¾ كلمة. الحدود دي اللي بتحمي التكلفة." />
                <PlanMatrix {...props} title="حدود تانية" rows={OTHER_LIMITS} />
              </>
            )}
            {open === "voice" && <VoiceCall {...props} />}
          </div>
        )}
      </SettingsEditor>
    </div>
  );
}
