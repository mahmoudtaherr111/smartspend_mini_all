import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  Mic,
  BrainCircuit,
} from "lucide-react";
import {
  Hint,
  FieldLabel,
  SectionHeader,
} from "./AdminSettingsShared";
import { RoutingRangesEditor } from "./RoutingRangesEditor";

// ─── STT Plan Config ───
function SttPlanConfig({
  plan,
  formData,
  updateField,
  models,
}: {
  plan: string;
  formData: any;
  updateField: any;
  models: any[];
}) {
  const providerKey = `${plan}_stt_provider`;
  const modelKey = `${plan}_stt_model`;
  const slotKey = `${plan}_stt_key_slot`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <FieldLabel hint="الخادم السحابي المستخدم لتحويل الصوت إلى نص">
          الخادم السحابي
        </FieldLabel>
        <Select
          value={formData[providerKey] || "gemini"}
          onValueChange={(v) => {
            updateField(providerKey, v);
            updateField(modelKey, ""); // Clear model when provider changes
          }}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Google Cloud</SelectItem>
            <SelectItem value="groq">Groq Audio</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <FieldLabel hint="الموديل المستخدم كأول محاولة لتحويل الصوت">
          الموديل الأساسي
        </FieldLabel>
        <Select
          value={formData[modelKey] || ""}
          onValueChange={(v) => updateField(modelKey, v)}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models
              .filter((m) => {
                const providerMatch =
                  (formData[providerKey] || "gemini") === "groq"
                    ? m.provider === "groq"
                    : m.provider === "gemini";
                const isAudio =
                  m.id.includes("whisper") || m.provider === "gemini";
                return providerMatch && isAudio;
              })
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <FieldLabel hint="المفتاح المستخدم لهذه الباقة في طلبات STT">
          المفتاح المستخدم
        </FieldLabel>
        <Select
          value={formData[slotKey] || "key1"}
          onValueChange={(v) => updateField(slotKey, v)}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
            <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
            <SelectItem value="groq">🔑 Groq Key</SelectItem>
            <SelectItem value="stt">🎤 STT Custom Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Report Plan Config ───
function ReportPlanConfig({
  plan,
  formData,
  updateField,
  models,
}: {
  plan: string;
  formData: any;
  updateField: any;
  models: any[];
}) {
  const providerKey = `report_provider_${plan}`;
  const modelKey = `report_model_${plan}`;
  const slotKey = `report_key_slot_${plan}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <FieldLabel hint="الخادم المستخدم لتوليد التقارير الشهرية">
          الخادم السحابي للتقارير
        </FieldLabel>
        <Select
          value={formData[providerKey] || "gemini"}
          onValueChange={(v) => {
            updateField(providerKey, v);
            updateField(modelKey, ""); // Clear model when provider changes
          }}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Google Cloud</SelectItem>
            <SelectItem value="groq">Groq (سرعة عالية)</SelectItem>
            <SelectItem value="fireworks">Fireworks.ai</SelectItem>
            <SelectItem value="nvidia">NVIDIA NIM (خوادم إنفيديا المسرّعة)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <FieldLabel hint="الموديل المستخدم في توليد التحليلات الشهرية">
          موديل التحليل
        </FieldLabel>
        <Select
          value={formData[modelKey] || ""}
          onValueChange={(v) => updateField(modelKey, v)}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models
              .filter((m) => {
                if (m.id.includes("whisper")) return false;
                const currentProvider = formData[providerKey] || "gemini";
                return m.provider === currentProvider;
              })
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span>{m.name}</span>
                    {m.pricing && (
                      <span className="text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {m.pricing}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <FieldLabel hint="مفتاح API المستخدم لطلبات التقارير">
          المفتاح المستخدم
        </FieldLabel>
        <Select
          value={formData[slotKey] || "key1"}
          onValueChange={(v) => updateField(slotKey, v)}
        >
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
            <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
            <SelectItem value="groq">🔑 Groq Key</SelectItem>
            <SelectItem value="fireworks">🔑 Fireworks Key</SelectItem>
            <SelectItem value="nvidia">🔑 NVIDIA Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Number Input ───
function NumInput({
  label,
  hint,
  settingKey,
  formData,
  updateField,
  min,
  max,
  unit,
}: {
  label: string;
  hint?: string;
  settingKey: string;
  formData: any;
  updateField: any;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative">
        <Input
          type="number"
          dir="ltr"
          className={`font-mono bg-slate-50 dark:bg-slate-900 ${unit ? "ps-16" : ""}`}
          value={formData[settingKey] || ""}
          min={min}
          max={max}
          onChange={(e) => updateField(settingKey, e.target.value)}
        />
        {unit && (
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Per-Plan Advanced Limits ───
function PlanAdvancedLimits({
  plan,
  formData,
  updateField,
}: {
  plan: string;
  formData: any;
  updateField: any;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <NumInput
          label="سقف توكنز/شهر"
          hint="الحد الأقصى من التوكنز التي يمكن للمستخدم استهلاكها شهرياً عبر جميع القنوات"
          settingKey={`${plan}_token_limit`}
          formData={formData}
          updateField={updateField}
          unit="token"
        />
        <NumInput
          label="حد يومي (طلبات)"
          hint="أقصى عدد طلبات parse يمكن إجراؤها خلال يوم واحد. تُحسب من جدول classification_logs"
          settingKey={`${plan}_daily_limit`}
          formData={formData}
          updateField={updateField}
          unit="طلب/يوم"
        />
        <NumInput
          label="max tokens / parse"
          hint="الحد الأقصى من الـ output tokens لكل طلب تصنيف واحد. يطبق ceiling من HARD_REQUEST_TOKEN_CAP"
          settingKey={`${plan}_max_per_request`}
          formData={formData}
          updateField={updateField}
          unit="token"
        />
        <NumInput
          label="دقائق صوت/شهر (ثواني)"
          hint="إجمالي ثواني التسجيل الصوتي المسموح بها شهرياً. مثال: 300 = 5 دقائق"
          settingKey={`voice_limit_${plan}`}
          formData={formData}
          updateField={updateField}
          unit="ثانية"
        />
        <NumInput
          label="max ثواني / رسالة صوتية"
          hint="أقصى مدة لتسجيل صوتي واحد. الزيادة عن هذا الحد يُرفض الطلب"
          settingKey={`voice_per_req_${plan}`}
          formData={formData}
          updateField={updateField}
          unit="ثانية"
        />
        <NumInput
          label="حد SMS/شهر"
          hint="عدد رسائل SMS المصرح بمعالجتها شهرياً. يُقرأ من sms-router"
          settingKey={`sms_limit_${plan}`}
          formData={formData}
          updateField={updateField}
          unit="رسالة"
        />
        <NumInput
          label="حد العمليات أوفلاين"
          hint="أقصى عدد معاملات نصية يمكن للمستخدم تسجيلها وحفظها محلياً في وضع أوفلاين"
          settingKey={`offline_limit_${plan}`}
          formData={formData}
          updateField={updateField}
          unit="عملية"
        />
      </div>

      <div className="pt-2 border-t dark:border-slate-800">
        <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> إعدادات التقارير
          الشهرية
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <NumInput
            label="عدد كلمات التقرير"
            hint="الهدف المطلوب من الذكاء الاصطناعي لعدد كلمات التقرير الشهري"
            settingKey={`report_words_${plan}`}
            formData={formData}
            updateField={updateField}
            unit="كلمة"
          />
          <NumInput
            label="أيام بين التقارير"
            hint="الحد الأدنى للأيام بين كل تقرير والآخر. 0 = بدون حد"
            settingKey={`report_limit_${plan}`}
            formData={formData}
            updateField={updateField}
            unit="يوم"
          />
          <NumInput
            label="max tokens التقرير"
            hint="الحد الأقصى لـ output tokens في طلبات التقارير الشهرية"
            settingKey={`report_max_tokens_${plan}`}
            formData={formData}
            updateField={updateField}
            unit="token"
          />
          <NumInput
            label="عدد الفئات الفرعية"
            hint="عدد الـ subcategories المُرسلة للـ AI في ملخص التقرير"
            settingKey={`report_subcats_${plan}`}
            formData={formData}
            updateField={updateField}
            unit="فئة"
          />
          {plan !== "free" && (
            <NumInput
              label="أكبر العمليات (Pro+)"
              hint="عدد أكبر وأكثر العمليات تكراراً التي تُرسل للـ AI في التقارير. للـ Free دايماً 0"
              settingKey={`report_top_items_${plan}`}
              formData={formData}
              updateField={updateField}
              unit="عملية"
            />
          )}
        </div>
      </div>

      <div className="pt-2 border-t dark:border-slate-800">
        <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" /> صلاحيات الميزات
        </p>
        <div className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <Label className="cursor-pointer font-medium">
                تفعيل الإدخال الذكي (AI Parse)
              </Label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تصنيف المصروفات بالعامية المصرية عبر الذكاء الاصطناعي
              </p>
            </div>
            <Switch
              checked={formData[`${plan}_ai_parse`] !== "false"}
              onCheckedChange={(c) =>
                updateField(`${plan}_ai_parse`, c ? "true" : "false")
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="cursor-pointer font-medium">
                تفعيل التقارير الشهرية (AI Analysis)
              </Label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                التحليل المالي الشهري الشامل بالذكاء الاصطناعي
              </p>
            </div>
            <Switch
              checked={formData[`${plan}_ai_analysis`] !== "false"}
              onCheckedChange={(c) =>
                updateField(`${plan}_ai_analysis`, c ? "true" : "false")
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdminPlansTabProps {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
  models: any[];
}

export function AdminPlansTab({
  formData,
  updateField,
  models,
}: AdminPlansTabProps) {
  return (
    <div className="space-y-6">
      {/* STT Fallback */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
        <SectionHeader
          icon={<Mic className="w-5 h-5 text-rose-500" />}
          title="إعداد الـ Fallback للصوت (STT)"
          description="الموديل الاحتياطي للتحويل الصوتي عند فشل الموديل الأساسي"
        />
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
            <div className="space-y-2">
              <FieldLabel hint="الموديل الاحتياطي الذي يُستخدم عند فشل الموديل الأساسي (أيهما كان للباقة). يُقرأ في ai-router.ts:993">
                Fallback STT Model
              </FieldLabel>
              <Select
                value={formData.stt_fallback_model || "gemini-2.0-flash"}
                onValueChange={(v) => updateField("stt_fallback_model", v)}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models
                    .filter(
                      (m) =>
                        !m.id.includes("whisper") || m.provider === "groq",
                    )
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                يُستخدم فقط عند فشل الموديل الأساسي للباقة
              </p>
            </div>
            <div className="space-y-2">
              <FieldLabel hint="وضع المعالجة الصوتية — standard: أسرع، enhanced: أدق لكن أبطأ">
                وضع المعالجة (Processing Mode)
              </FieldLabel>
              <Select
                value={formData.stt_processing_mode || "standard"}
                onValueChange={(v) => updateField("stt_processing_mode", v)}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    Standard — سريع وموفر
                  </SelectItem>
                  <SelectItem value="enhanced">Enhanced — أدق (أبطأ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Egyptian Dialect Classification Engine */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-emerald-500">
        <SectionHeader
          icon={<BrainCircuit className="w-5 h-5 text-emerald-600" />}
          title="محرك دقة التصنيف المصري"
          description="تحكم مباشر في طبقات التفكيك المحلي، ذاكرة الأشخاص، والمراجعة النهائية قبل الحفظ."
        />
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                key: "parser_fast_decomposition_enabled",
                title: "تفكيك الجمل الطويلة",
                hint: "يفصل الرسائل التي تحتوي على أكثر من عملية قبل التصنيف لتقليل نسيان المبالغ.",
              },
              {
                key: "parser_person_memory_enabled",
                title: "ذاكرة الأشخاص",
                hint: "يسأل مين الشخص عند أول ذكر، ثم يستخدم العلاقة المحفوظة في التصنيفات القادمة.",
              },
              {
                key: "parser_local_verifier_enabled",
                title: "المراجع المحلي النهائي",
                hint: "يراجع الأرقام والتصنيفات والتكرارات محلياً قبل الحفظ، بدون توكنز إضافية.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-xl border bg-white dark:bg-slate-950 p-4"
              >
                <div className="space-y-1">
                  <Label className="text-sm font-bold flex items-center gap-1">
                    {item.title}
                    <Hint text={item.hint} />
                  </Label>
                  <p className="text-xs text-slate-500">
                    {formData[item.key] === "false" ? "متوقف" : "مفعل"}
                  </p>
                </div>
                <Switch
                  checked={(formData[item.key] || "true") === "true"}
                  onCheckedChange={(checked) =>
                    updateField(item.key, String(checked))
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
            <div className="space-y-2">
              <FieldLabel hint="أقل ثقة مطلوبة للحفظ التلقائي بعد كل طبقات المراجعة. القيمة الأعلى أدق لكنها تزود المراجعة اليدوية.">
                حد الحفظ التلقائي
              </FieldLabel>
              <Input
                type="number"
                min="50"
                max="100"
                dir="ltr"
                value={formData.parser_auto_save_threshold || "85"}
                onChange={(e) =>
                  updateField("parser_auto_save_threshold", e.target.value)
                }
                className="font-mono bg-slate-50 dark:bg-slate-900"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel hint="أقل ثقة لقبول نتيجة قابلة للمراجعة بدل سؤال المستخدم مباشرة.">
                حد المراجعة
              </FieldLabel>
              <Input
                type="number"
                min="0"
                max="100"
                dir="ltr"
                value={formData.parser_review_threshold || "60"}
                onChange={(e) =>
                  updateField("parser_review_threshold", e.target.value)
                }
                className="font-mono bg-slate-50 dark:bg-slate-900"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Specific Settings */}
      <Tabs defaultValue="free" className="w-full">
        <TabsList className="mb-6 p-1 bg-transparent border-b w-full justify-start rounded-none h-auto gap-4">
          <TabsTrigger
            value="free"
            className="text-lg pb-3 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none bg-transparent data-[state=active]:shadow-none data-[state=active]:bg-transparent"
          >
            الباقة المجانية (Free)
          </TabsTrigger>
          <TabsTrigger
            value="pro"
            className="text-lg pb-3 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none bg-transparent data-[state=active]:shadow-none data-[state=active]:bg-transparent"
          >
            الباقة المدفوعة (Pro / Ultra)
          </TabsTrigger>
        </TabsList>

        {["free", "pro"].map((plan) => (
          <TabsContent
            key={plan}
            value={plan}
            className="space-y-8 animate-in slide-in-from-end-4"
          >
            {/* Routing Ranges */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
              <SectionHeader
                icon={<Route className="w-6 h-6 text-indigo-600" />}
                title="التوجيه الديناميكي للذكاء الاصطناعي (Parse Routing)"
                description="يتحكم في الموديل المستخدم بناءً على استهلاك التوكنز الشهري. يُطبق فقط على طلبات التصنيف (Parse) — وليس التقارير أو الصوت."
              />
              <CardContent className="p-6 bg-slate-50/30 dark:bg-slate-900/10">
                <RoutingRangesEditor
                  planName={plan}
                  rawValue={formData[`${plan}_routing_ranges`] || ""}
                  onChange={(v) => updateField(`${plan}_routing_ranges`, v)}
                  models={models}
                />
              </CardContent>
            </Card>

            {/* Dedicated Engines */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Settings2 className="w-5 h-5 text-slate-600" />}
                title="محركات المعالجة المخصصة (Reports & Voice)"
              />
              <CardContent className="p-6 space-y-8">
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" /> محرك التقارير
                    الشهرية
                  </h4>
                  <ReportPlanConfig
                    plan={plan}
                    formData={formData}
                    updateField={updateField}
                    models={models}
                  />
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-rose-500" /> المحرك الصوتي (STT
                    Engine)
                  </h4>
                  <SttPlanConfig
                    plan={plan}
                    formData={formData}
                    updateField={updateField}
                    models={models}
                  />
                </div>
              </CardContent>
            </Card>

            {/* All Limits */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
              <SectionHeader
                icon={<ShieldCheck className="w-5 h-5 text-slate-600" />}
                title="القواعد الاستهلاكية والحدود الكاملة"
                description="كل هذه الحقول بيتقرأها الـ backend مباشرة — لا توجد حقول وهمية هنا"
              />
              <CardContent className="p-6">
                <PlanAdvancedLimits
                  plan={plan}
                  formData={formData}
                  updateField={updateField}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* AI Voice Call Settings */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500 mt-8">
        <SectionHeader
          icon={<Mic className="w-6 h-6 text-indigo-600" />}
          title="إعدادات المكالمة الصوتية بالذكاء الاصطناعي (Voice Call Configuration)"
          description="تحكم في باقات المكالمات الصوتية للذكاء الاصطناعي، نموذج التوليد الصوتي، والحدود الزمنية لكل باقة."
        />
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
            <div className="space-y-2">
              <FieldLabel hint="نموذج توليد وتجاوب الصوت الحي المفضل للمكالمات (Gemini Multimodal Live)">
                نموذج الصوت الحي (Voice Model)
              </FieldLabel>
              <Select
                value={
                  formData.voice_call_model ||
                  "gemini-2.5-flash-native-audio-preview-12-2025"
                }
                onValueChange={(v) => updateField("voice_call_model", v)}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                  <SelectValue placeholder="اختر الموديل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash-native-audio-preview-12-2025">
                    Gemini 2.5 Flash Native Audio Dialog
                  </SelectItem>
                  <SelectItem value="gemini-3.1-flash-live-preview">
                    Gemini 3.1 Flash Live
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-sm font-bold mb-4 text-slate-800 dark:text-slate-200">
              حدود الاتصال والتشغيل حسب باقات الاشتراك:
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { planKey: "free", label: "الباقة المجانية (Free)" },
                { planKey: "pro", label: "باقة البرو (Pro)" },
                { planKey: "ultra", label: "باقة الألترا (Ultra 💎)" },
              ].map(({ planKey, label }) => {
                const enabledKey = `voice_call_enabled_${planKey}`;
                const limitKey = `voice_call_limit_${planKey}`;
                const durationKey = `voice_call_duration_${planKey}`;

                return (
                  <div
                    key={planKey}
                    className="p-4 rounded-xl border bg-white dark:bg-slate-950/40 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <Label className="font-bold text-xs">{label}</Label>
                      <Switch
                        checked={(formData[enabledKey] || "true") === "true"}
                        onCheckedChange={(checked) =>
                          updateField(enabledKey, String(checked))
                        }
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">
                          الحد الشهري (بالدقائق)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={formData[limitKey] || ""}
                          onChange={(e) => updateField(limitKey, e.target.value)}
                          className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
                          disabled={(formData[enabledKey] || "true") === "false"}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 font-medium">
                          أقصى مدة للمكالمة الواحدة (بالثواني)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={formData[durationKey] || ""}
                          onChange={(e) =>
                            updateField(durationKey, e.target.value)
                          }
                          className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
                          disabled={(formData[enabledKey] || "true") === "false"}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Chatbot Settings */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
        <SectionHeader
          icon="🤖"
          title="إعدادات الشات بوت الذكي (AI Chatbot)"
          description="التحكم في موديل الشات بوت، الحدود، والمفاتيح"
        />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Chatbot Model</Label>
              <Input
                value={
                  formData.chatbot_model ||
                  "accounts/fireworks/models/deepseek-v4-0324"
                }
                onChange={(e) => updateField("chatbot_model", e.target.value)}
                className="h-8 font-mono text-xs bg-slate-50 dark:bg-slate-900"
                placeholder="accounts/fireworks/models/deepseek-v4-0324"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Base URL</Label>
              <Input
                value={
                  formData.chatbot_base_url ||
                  "https://api.fireworks.ai/inference/v1"
                }
                onChange={(e) =>
                  updateField("chatbot_base_url", e.target.value)
                }
                className="h-8 font-mono text-xs bg-slate-50 dark:bg-slate-900"
                placeholder="https://api.fireworks.ai/inference/v1"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Chatbot API Key</Label>
              <Input
                type="password"
                value={formData.chatbot_api_key || ""}
                onChange={(e) => updateField("chatbot_api_key", e.target.value)}
                className="h-8 font-mono text-xs bg-slate-50 dark:bg-slate-900"
                placeholder="يستخدم مفتاح Fireworks لو فاضي"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Max History (رسائل)
              </Label>
              <Input
                type="number"
                value={formData.chatbot_max_history || "10"}
                onChange={(e) =>
                  updateField("chatbot_max_history", e.target.value)
                }
                className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <p className="text-xs font-bold text-muted-foreground">
              إعدادات لكل باقة
            </p>
            {(["free", "pro", "ultra"] as const).map((plan) => {
              const enabledKey = `chatbot_enabled_${plan}`;
              const dailyKey = `chatbot_daily_limit_${plan}`;
              const tokensKey = `chatbot_max_tokens_${plan}`;
              const planLabel =
                plan === "free" ? "مجاني" : plan === "pro" ? "PRO" : "ULTRA";
              const planColor =
                plan === "free"
                  ? "bg-slate-200 dark:bg-slate-700"
                  : plan === "pro"
                    ? "bg-amber-100 dark:bg-amber-900/30"
                    : "bg-violet-100 dark:bg-violet-900/30";
              const defaults = {
                free: { daily: "20", tokens: "1000" },
                pro: { daily: "200", tokens: "3000" },
                ultra: { daily: "999999", tokens: "5000" },
              };
              return (
                <div key={plan} className={`rounded-xl p-3 ${planColor}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold">{planLabel}</span>
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px]">تفعيل</Label>
                      <Switch
                        checked={(formData[enabledKey] || "true") === "true"}
                        onCheckedChange={(v) =>
                          updateField(enabledKey, v ? "true" : "false")
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">رسائل/يوم</Label>
                      <Input
                        type="number"
                        value={formData[dailyKey] || defaults[plan].daily}
                        onChange={(e) => updateField(dailyKey, e.target.value)}
                        className="h-7 font-mono text-xs bg-white dark:bg-slate-800"
                        disabled={(formData[enabledKey] || "true") === "false"}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Max Tokens/رد</Label>
                      <Input
                        type="number"
                        value={formData[tokensKey] || defaults[plan].tokens}
                        onChange={(e) => updateField(tokensKey, e.target.value)}
                        className="h-7 font-mono text-xs bg-white dark:bg-slate-800"
                        disabled={(formData[enabledKey] || "true") === "false"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
