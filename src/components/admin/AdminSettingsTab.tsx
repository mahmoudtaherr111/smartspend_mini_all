import React, { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Save,
  Terminal,
  Key,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  Database,
  Lock,
  Calendar,
  Plus,
  Trash2,
  Mic,
  BrainCircuit,
  Info,
  Zap,
  GitBranch,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ─── Hint Component ───
function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help inline-block ms-1 shrink-0" />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] text-xs leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Field Label with Hint ───
function FieldLabel({
  children,
  hint,
  required,
}: {
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <Label className="text-xs font-bold text-slate-600 flex items-center gap-1">
      {children}
      {required && <span className="text-rose-500 text-[10px]">*</span>}
      {hint && <Hint text={hint} />}
    </Label>
  );
}

// ─── Section Header ───
function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 px-6 py-5">
      <CardTitle className="text-lg flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
      {description && (
        <CardDescription className="mt-1.5 text-sm leading-relaxed">
          {description}
        </CardDescription>
      )}
    </div>
  );
}

// ─── Routing Ranges Editor ───
function RoutingRangesEditor({
  planName,
  rawValue,
  onChange,
  models,
}: {
  planName: string;
  rawValue: string;
  onChange: (val: string) => void;
  models: any[];
}) {
  let initialRanges: any[] = [];
  try {
    initialRanges = JSON.parse(rawValue || "[]");
  } catch (e) {}
  const [ranges, setRanges] = useState<any[]>(initialRanges);
  useEffect(() => {
    try {
      setRanges(JSON.parse(rawValue || "[]"));
    } catch (e) {}
  }, [rawValue]);

  const updateRange = (index: number, key: string, value: any) => {
    const newRanges = [...ranges];
    newRanges[index][key] = value;
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };
  const addRange = () => {
    const newRanges = [
      ...ranges,
      {
        from: 0,
        to: null,
        provider: "gemini",
        key_slot: "key1",
        model: "gemini-2.0-flash",
      },
    ];
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };
  const removeRange = (index: number) => {
    const newRanges = ranges.filter((_, i) => i !== index);
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };

  return (
    <div className="space-y-4">
      {ranges.map((r, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-950 p-4 rounded-xl border dark:border-slate-800 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 text-sm font-bold text-slate-600">
              {i + 1}
            </span>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">من (Tokens)</Label>
              <Input
                type="number"
                dir="ltr"
                className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900"
                value={r.from || 0}
                onChange={(e) => updateRange(i, "from", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">إلى (Tokens)</Label>
              <Input
                type="number"
                dir="ltr"
                className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900"
                value={r.to || ""}
                placeholder="لانهائي"
                onChange={(e) =>
                  updateRange(
                    i,
                    "to",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </div>
          </div>

          <div className="flex-1 min-w-[200px] flex items-center gap-3 border-r pe-3 dark:border-slate-800">
            <div className="space-y-1 w-28">
              <Label className="text-[10px] text-slate-500">الإجراء</Label>
              <Select
                value={r.action || "route"}
                onValueChange={(v) =>
                  updateRange(i, "action", v === "route" ? undefined : v)
                }
              >
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="route">استخدام موديل</SelectItem>
                  <SelectItem value="block">حظر فوري</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {r.action === "block" ? (
              <div className="space-y-1 flex-1">
                <Label className="text-[10px] text-slate-500">
                  رسالة الحظر للعميل
                </Label>
                <Input
                  className="h-9 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 border-rose-200"
                  placeholder="عفواً، لقد استنفدت رصيدك..."
                  value={r.message || ""}
                  onChange={(e) => updateRange(i, "message", e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1 w-24">
                  <Label className="text-[10px] text-slate-500">الخادم</Label>
                  <Select
                    value={r.provider || "gemini"}
                    onValueChange={(v) => {
                      updateRange(i, "provider", v);
                      updateRange(i, "model", ""); // Clear model when provider changes
                    }}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                      <SelectItem value="fireworks">Fireworks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-[10px] text-slate-500">
                    الموديل الفعلي
                  </Label>
                  <Select
                    value={r.model || ""}
                    onValueChange={(v) => updateRange(i, "model", v)}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models
                        .filter((m) =>
                          r.provider === "groq"
                            ? m.provider === "groq"
                            : r.provider === "fireworks"
                              ? m.provider === "fireworks"
                              : m.provider === "gemini",
                        )
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-[10px] text-slate-500">
                    مفتاح API
                  </Label>
                  <Select
                    value={r.key_slot || "key1"}
                    onValueChange={(v) => updateRange(i, "key_slot", v)}
                  >
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
                      <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
                      <SelectItem value="groq">🔑 Groq Key</SelectItem>
                      <SelectItem value="fireworks">🔑 Fireworks Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 self-end mb-0.5"
            onClick={(e) => {
              e.preventDefault();
              removeRange(i);
            }}
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-dashed border-2 hover:bg-slate-50 w-full justify-center h-14 text-slate-500 font-bold bg-white"
        onClick={(e) => {
          e.preventDefault();
          addRange();
        }}
      >
        <Plus className="w-5 h-5" /> إضافة شريحة استهلاك توكنز جديدة
      </Button>
    </div>
  );
}

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
                  {m.name}
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
          className={`font-mono bg-slate-50 dark:bg-slate-900 ${unit ? 'ps-16' : ''}`}
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

// ──────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────
export function AdminSettingsTab() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery();
  const { data: modelsData } = trpc.admin.getAvailableModels.useQuery();
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("✅ تم حفظ الإعدادات وتطبيقها فوراً على النظام!");
      refetch();
    },
    onError: () => toast.error("حدث خطأ أثناء حفظ الإعدادات"),
  });

  const backupMutation = trpc.admin.triggerBackupDemo.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data.backupData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartspend_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(data.message || "تم تنزيل النسخة الاحتياطية بنجاح! 💾");
    },
    onError: (err) => {
      toast.error(`فشل إنشاء النسخة الاحتياطية: ${err.message}`);
    },
  });

  const handleBackup = () => {
    backupMutation.mutate();
  };

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const isSettingsLoading = trpc.admin.getSettings.useQuery().isLoading;
  const isModelsLoading = trpc.admin.getAvailableModels.useQuery().isLoading;
  const isLoading = isSettingsLoading || isModelsLoading;

  useEffect(() => {
    if (settings && modelsData && !isLoaded) {
      setFormData({ ...settings });
      setIsLoaded(true);
    }
  }, [settings, modelsData, isLoaded]);

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(formData);
  };

  const models = modelsData?.models || [];

  return (
    <div
      className="space-y-8 animate-in fade-in-50 duration-500 pb-20"
      dir="rtl"
    >
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-slate-950/50 z-10 flex items-center justify-center backdrop-blur-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-indigo-600" /> لوحة التحكم
            الكاملة
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            كل إعداد هنا له تأثير مباشر على النظام — تحقق من الملاحظات
            <Info className="w-3.5 h-3.5 inline-block me-1 text-slate-400" />
            لفهم وظيفة كل خانة
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={handleBackup}
            disabled={backupMutation.isPending}
            variant="outline"
            size="lg"
            className="gap-2 border-indigo-200 hover:bg-indigo-50 dark:border-slate-800 text-indigo-700 dark:text-indigo-400"
          >
            <Download className="w-5 h-5" />
            {backupMutation.isPending ? "جاري التجميع..." : "نسخة احتياطية (Backup)"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateSettings.isPending}
            size="lg"
            className="gap-2 shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white px-8"
          >
            <Save className="w-5 h-5" />
            {updateSettings.isPending
              ? "جاري الحفظ والتطبيق..."
              : "حفظ وتنفيذ الإعدادات"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="plans" className="w-full space-y-8">
        <TabsList className="p-1.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-2xl flex-wrap h-auto gap-2 border border-white/50 dark:border-slate-800 shadow-inner w-full sm:w-fit">
          <TabsTrigger
            value="plans"
            className="gap-2 py-3 px-5 rounded-xl data-[state=active]:bg-white/90 data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:text-indigo-700 font-bold transition-all"
          >
            <Database className="w-4 h-4" /> إدارة الباقات
          </TabsTrigger>
          <TabsTrigger
            value="keys"
            className="gap-2 py-3 px-5 rounded-xl data-[state=active]:bg-white/90 data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:text-amber-600 font-bold transition-all"
          >
            <Lock className="w-4 h-4" /> خزنة المفاتيح
          </TabsTrigger>
          <TabsTrigger
            value="codes"
            className="gap-2 py-3 px-5 rounded-xl data-[state=active]:bg-white/90 data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm data-[state=active]:text-emerald-600 font-bold transition-all"
          >
            <Calendar className="w-4 h-4" /> الخصومات والدعوات
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          {/* STT Fallback moved down */}

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
                      onValueChange={(v) =>
                        updateField("stt_fallback_model", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models
                          .filter(
                            (m) =>
                              !m.id.includes("whisper") ||
                              m.provider === "groq",
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
                      onValueChange={(v) =>
                        updateField("stt_processing_mode", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">
                          Standard — سريع وموفر
                        </SelectItem>
                        <SelectItem value="enhanced">
                          Enhanced — أدق (أبطأ)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          {/* ══════════════════════════════════════════════════════════
              TAB 2: إدارة الباقات
          ══════════════════════════════════════════════════════════ */}
          <TabsContent
            value="plans"
            className="space-y-6 animate-in fade-in-50"
          >
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
                        onChange={(v) =>
                          updateField(`${plan}_routing_ranges`, v)
                        }
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
                          <Sparkles className="w-4 h-4 text-amber-500" /> محرك
                          التقارير الشهرية
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
                          <Mic className="w-4 h-4 text-rose-500" /> المحرك
                          الصوتي (STT Engine)
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

            {/* ─── AI Voice Call Settings (جديد) ─── */}
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
                      value={formData.voice_call_model || "gemini-2.5-flash-native-audio-preview-12-2025"}
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
                                onChange={(e) => updateField(durationKey, e.target.value)}
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

            {/* ──── AI Chatbot Settings ──── */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
              <SectionHeader
                icon="🤖"
                title="إعدادات الشات بوت الذكي (AI Chatbot)"
                description="التحكم في موديل الشات بوت، الحدود، والمفاتيح"
              />
              <CardContent className="space-y-4">
                {/* Model & API */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Chatbot Model</Label>
                    <Input
                      value={formData.chatbot_model || "accounts/fireworks/models/deepseek-v4-0324"}
                      onChange={(e) => updateField("chatbot_model", e.target.value)}
                      className="h-8 font-mono text-xs bg-slate-50 dark:bg-slate-900"
                      placeholder="accounts/fireworks/models/deepseek-v4-0324"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Base URL</Label>
                    <Input
                      value={formData.chatbot_base_url || "https://api.fireworks.ai/inference/v1"}
                      onChange={(e) => updateField("chatbot_base_url", e.target.value)}
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
                    <Label className="text-xs font-medium">Max History (رسائل)</Label>
                    <Input
                      type="number"
                      value={formData.chatbot_max_history || "10"}
                      onChange={(e) => updateField("chatbot_max_history", e.target.value)}
                      className="h-8 font-mono bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                </div>

                {/* Per-Plan Settings */}
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-muted-foreground">إعدادات لكل باقة</p>
                  {(["free", "pro", "ultra"] as const).map((plan) => {
                    const enabledKey = `chatbot_enabled_${plan}` as keyof typeof formData;
                    const dailyKey = `chatbot_daily_limit_${plan}` as keyof typeof formData;
                    const tokensKey = `chatbot_max_tokens_${plan}` as keyof typeof formData;
                    const planLabel = plan === "free" ? "مجاني" : plan === "pro" ? "PRO" : "ULTRA";
                    const planColor = plan === "free" ? "bg-slate-200 dark:bg-slate-700" : plan === "pro" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-violet-100 dark:bg-violet-900/30";
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
                              onCheckedChange={(v) => updateField(enabledKey as string, v ? "true" : "false")}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">رسائل/يوم</Label>
                            <Input
                              type="number"
                              value={formData[dailyKey] || defaults[plan].daily}
                              onChange={(e) => updateField(dailyKey as string, e.target.value)}
                              className="h-7 font-mono text-xs bg-white dark:bg-slate-800"
                              disabled={(formData[enabledKey] || "true") === "false"}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Max Tokens/رد</Label>
                            <Input
                              type="number"
                              value={formData[tokensKey] || defaults[plan].tokens}
                              onChange={(e) => updateField(tokensKey as string, e.target.value)}
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
          </TabsContent>
          {/* ══════════════════════════════════════════════════════════
              TAB 3: خزنة المفاتيح
          ══════════════════════════════════════════════════════════ */}
          <TabsContent value="keys" className="space-y-6">
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-amber-500">
              <SectionHeader
                icon={<Key className="w-6 h-6 text-amber-600" />}
                title="خزنة المفاتيح المركزية (API Vault)"
                description="احفظ مفاتيحك هنا مرة واحدة — يمكنك الإشارة إليها بالاسم (key1, key2, groq) من أي إعداد آخر في النظام"
              />
              <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                  {
                    label: "Gemini Primary Key",
                    id: "key1",
                    field: "ai_api_key",
                    placeholder: "AIzaSy...",
                    badge: "الأساسي",
                    color: "blue",
                    hint: "المفتاح الأساسي لـ Google Gemini. يُستخدم عند اختيار key1 في أي إعداد",
                  },
                  {
                    label: "Gemini Backup Key",
                    id: "key2",
                    field: "ai_api_key_2",
                    placeholder: "AIzaSy...",
                    badge: "الاحتياطي",
                    color: "slate",
                    hint: "مفتاح Gemini احتياطي. يُستخدم عند اختيار key2 أو عند فشل المفتاح الأساسي",
                  },
                  {
                    label: "Groq Ultra Fast Key",
                    id: "groq",
                    field: "groq_api_key",
                    placeholder: "gsk_...",
                    badge: "للسرعة العالية",
                    color: "orange",
                    hint: "مفتاح Groq للموديلات السريعة (Llama, Whisper). يُستخدم عند اختيار groq",
                  },
                  {
                    label: "Fireworks AI Key",
                    id: "fireworks",
                    field: "fireworks_api_key",
                    placeholder: "fw_...",
                    badge: "للاستجابة الفائقة",
                    color: "purple",
                    hint: "مفتاح Fireworks.ai للموديلات مثل DeepSeek V4. يُستخدم عند اختيار fireworks",
                  },
                  {
                    label: "Custom STT Primary Key",
                    id: "stt",
                    field: "stt_api_key",
                    placeholder: "AIzaSy...",
                    badge: "صوت أساسي",
                    color: "emerald",
                    hint: "مفتاح مخصص لعمليات STT فقط. مفيد للفصل بين حصص الـ AI والصوت",
                  },
                  {
                    label: "Custom STT Backup Key",
                    id: "stt2",
                    field: "stt_api_key_2",
                    placeholder: "AIzaSy...",
                    badge: "صوت احتياطي",
                    color: "slate",
                    hint: "مفتاح STT احتياطي عند فشل المفتاح الأساسي للصوت",
                  },
                ].map(
                  ({ label, id, field, placeholder, badge, color, hint }) => (
                    <div
                      key={field}
                      className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm"
                    >
                      <div className="flex items-center justify-between border-b pb-3 mb-2">
                        <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <span className="text-xl">
                            {field.includes("groq")
                              ? "⚡"
                              : field.includes("fireworks")
                                ? "🎆"
                                : field.includes("stt")
                                  ? "🎤"
                                  : "🔑"}
                          </span>
                          {label}
                          <Hint text={hint} />
                        </Label>
                        <Badge variant="outline" className="text-xs">
                          {badge}
                        </Badge>
                      </div>
                      <Input
                        type="password"
                        placeholder={placeholder}
                        value={formData[field] || ""}
                        onChange={(e) => updateField(field, e.target.value)}
                        dir="ltr"
                        className="font-mono h-12 text-lg tracking-wider"
                      />
                      <p className="text-xs text-muted-foreground pt-1">
                        المعرف:{" "}
                        <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          {id}
                        </code>
                      </p>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>

            {/* RAG Settings */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden mt-8 border-t-4 border-t-purple-500">
              <SectionHeader
                icon={<BrainCircuit className="w-5 h-5 text-purple-600" />}
                title="إعدادات الـ Personalized RAG"
                description="تحكم في نظام استرجاع المعاملات السابقة (RAG) لزيادة دقة التصنيف"
              />
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 col-span-1 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="cursor-pointer font-medium flex items-center gap-2">
                          تفعيل نظام الـ RAG
                          <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200">New</Badge>
                        </Label>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          يقوم بمطابقة معاملات المستخدم الجديدة مع تاريخه القديم لزيادة الدقة وتقليل الهلوسة
                        </p>
                      </div>
                      <Switch
                        checked={formData.enable_rag !== "false"}
                        onCheckedChange={(c) =>
                          updateField("enable_rag", c ? "true" : "false")
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FieldLabel hint="المفتاح المخصص لمحرك الـ RAG. إذا تركته فارغاً سيتم استخدام المفتاح الأساسي للذكاء الاصطناعي كاحتياطي.">
                      مفتاح واجهة الـ RAG (API Key)
                    </FieldLabel>
                    <Input
                      type="password"
                      placeholder="مثال: AIzaSy... (اختياري)"
                      value={formData.rag_api_key || ""}
                      onChange={(e) => updateField("rag_api_key", e.target.value)}
                      dir="ltr"
                      className="font-mono bg-slate-50 dark:bg-slate-900"
                    />
                  </div>

                  <div className="space-y-2">
                    <FieldLabel hint="الموديل المستخدم لإنشاء الـ Embeddings. (الافتراضي لجوجل هو text-embedding-004)">
                      اسم الموديل (Model Name)
                    </FieldLabel>
                    <Input
                      type="text"
                      placeholder="text-embedding-004"
                      value={formData.rag_model || ""}
                      onChange={(e) => updateField("rag_model", e.target.value)}
                      dir="ltr"
                      className="font-mono bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* STT Fallback moved here */}
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden mt-8">
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
                      onValueChange={(v) =>
                        updateField("stt_fallback_model", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models
                          .filter(
                            (m) =>
                              !m.id.includes("whisper") ||
                              m.provider === "groq",
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
                      onValueChange={(v) =>
                        updateField("stt_processing_mode", v)
                      }
                    >
                      <SelectTrigger className="bg-slate-50 dark:bg-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">
                          Standard — سريع وموفر
                        </SelectItem>
                        <SelectItem value="enhanced">
                          Enhanced — أدق (أبطأ)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* Prompts Tab Removed */}

          {/* ══════════════════════════════════════════════════════════
              TAB 5: الخصومات والدعوات
          ══════════════════════════════════════════════════════════ */}
          <TabsContent value="codes" className="space-y-8">
            <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-blue-500">
              <SectionHeader
                icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
                title="إعدادات الإحالة العامة"
              />
              <CardContent className="p-6">
                <div className="max-w-md space-y-3">
                  <FieldLabel hint="نسبة الخصم التي تُطبق على أكواد الإحالة الافتراضية. يُقرأ من promo_code_discount في referral-router.ts">
                    نسبة الخصم لرمز الإحالة الأساسي (%)
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      type="number"
                      dir="ltr"
                      min={1}
                      max={100}
                      className="font-mono text-lg py-6 bg-slate-50 dark:bg-slate-900"
                      value={formData.promo_code_discount || ""}
                      onChange={(e) =>
                        updateField("promo_code_discount", e.target.value)
                      }
                    />
                    <span className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                      %
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <DiscountCodesManager />
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}

// ─── Discount Codes Manager ───
function DiscountCodesManager() {
  const utils = trpc.useUtils();
  const { data: codes, isLoading } = trpc.admin.getDiscountCodes.useQuery();
  const createCode = trpc.admin.createDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("تم إصدار الكود بنجاح 🎉");
      utils.admin.getDiscountCodes.invalidate();
      setShowForm(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteCode = trpc.admin.deleteDiscountCode.useMutation({
    onSuccess: () => {
      toast.success("تم إبطال الكود");
      utils.admin.getDiscountCodes.invalidate();
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("20");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between">
        <CardTitle className="text-lg">حملات العروض الترويجية</CardTitle>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus className="w-4 h-4" /> إصدار كود جديد
        </Button>
      </div>

      {showForm && (
        <div className="p-6 bg-slate-50/80 dark:bg-slate-900/80 border-b dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-bold">اسم الكود (إنجليزي)</Label>
              <Input
                placeholder="EID2024"
                dir="ltr"
                className="font-mono uppercase dark:bg-slate-950"
                value={newCode}
                onChange={(e) =>
                  setNewCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">نسبة الخصم %</Label>
              <Input
                type="number"
                dir="ltr"
                min="1"
                max="100"
                className="font-mono dark:bg-slate-950"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">أقصى عدد استخدام</Label>
              <Input
                type="number"
                dir="ltr"
                placeholder="لا نهائي"
                className="font-mono dark:bg-slate-950"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">تاريخ الانتهاء</Label>
              <Input
                type="date"
                dir="ltr"
                className="dark:bg-slate-950"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              className="gap-2 w-full md:w-auto"
              disabled={!newCode || createCode.isPending}
              onClick={() =>
                createCode.mutate({
                  code: newCode,
                  discountPercent: Number(newDiscount) || 20,
                  maxUses: newMaxUses ? Number(newMaxUses) : undefined,
                  expiresAt: newExpiry || undefined,
                })
              }
            >
              {createCode.isPending ? "جاري الإصدار..." : "تفعيل الكود"}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">
            جاري تحميل البيانات...
          </div>
        ) : (
          <div className="divide-y">
            {(!codes || codes.length === 0) && (
              <div className="p-8 text-center text-slate-500">
                لا توجد أكواد ترويجية مُفعلة حالياً.
              </div>
            )}
            {codes?.map((c: any) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 hover:bg-slate-50 transition-colors gap-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold text-lg bg-slate-100 dark:bg-slate-800 text-slate-800 px-3 py-1 rounded-md border border-slate-200">
                    {c.code}
                  </span>
                  <Badge
                    variant="default"
                    className="bg-emerald-500 hover:bg-emerald-600"
                  >
                    {c.discountPercent}% خصم
                  </Badge>
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-white border px-3 py-1 rounded-full shadow-sm">
                    <span className="font-bold text-slate-900">
                      {c.usedCount || 0}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span>{c.maxUses ? c.maxUses : "∞"} استخدام</span>
                  </div>
                  {c.expiresAt && (
                    <span className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> ينتهي:{" "}
                      {new Date(c.expiresAt).toLocaleDateString("ar-EG")}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 self-end sm:self-auto"
                  onClick={() => {
                    if (confirm("إبطال هذا الكود الترويجي؟"))
                      deleteCode.mutate({ id: c.id });
                  }}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
