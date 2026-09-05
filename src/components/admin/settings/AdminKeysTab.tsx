import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key, BrainCircuit, Mic, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Hint, FieldLabel, SectionHeader } from "./AdminSettingsShared";
import { trpc } from "@/providers/trpc";

interface AdminKeysTabProps {
  formData: Record<string, string>;
  updateField: (key: string, value: string) => void;
  models: any[];
}

export function AdminKeysTab({
  formData,
  updateField,
  models,
}: AdminKeysTabProps) {
  const validateMutation = trpc.admin.validateApiKey.useMutation();
  const [validationResults, setValidationResults] = useState<
    Record<string, { loading: boolean; valid?: boolean; message?: string }>
  >({});

  const handleValidate = async (
    provider: "gemini" | "groq" | "fireworks" | "nvidia",
    keyField: string,
  ) => {
    const keyValue = formData[keyField];
    if (!keyValue) return;
    setValidationResults((prev) => ({
      ...prev,
      [keyField]: { loading: true },
    }));
    try {
      const res = await validateMutation.mutateAsync({
        provider,
        apiKey: keyValue,
      });
      setValidationResults((prev) => ({
        ...prev,
        [keyField]: { loading: false, valid: res.valid, message: res.message },
      }));
    } catch (err: any) {
      setValidationResults((prev) => ({
        ...prev,
        [keyField]: {
          loading: false,
          valid: false,
          message: err.message || "فشل التحقق من المفتاح",
        },
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Central API Vault */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-amber-500">
        <SectionHeader
          icon={<Key className="w-6 h-6 text-amber-600" />}
          title="خزنة المفاتيح المركزية (API Vault)"
          description="احفظ مفاتيحك هنا مرة واحدة — يمكنك الإشارة إليها بالاسم (key1, key2, groq, nvidia) من أي إعداد آخر في النظام"
        />
        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          {[
            {
              label: "Gemini Primary Key",
              id: "key1",
              provider: "gemini" as const,
              field: "ai_api_key",
              placeholder: "AIzaSy...",
              badge: "الأساسي",
              color: "blue",
              hint: "المفتاح الأساسي لـ Google Gemini. يُستخدم عند اختيار key1 في أي إعداد",
            },
            {
              label: "Gemini Backup Key",
              id: "key2",
              provider: "gemini" as const,
              field: "ai_api_key_2",
              placeholder: "AIzaSy...",
              badge: "الاحتياطي",
              color: "slate",
              hint: "مفتاح Gemini احتياطي. يُستخدم عند اختيار key2 أو عند فشل المفتاح الأساسي",
            },
            {
              label: "Groq Ultra Fast Key",
              id: "groq",
              provider: "groq" as const,
              field: "groq_api_key",
              placeholder: "gsk_...",
              badge: "للسرعة العالية",
              color: "orange",
              hint: "مفتاح Groq للموديلات السريعة (Llama, Whisper). يُستخدم عند اختيار groq",
            },
            {
              label: "Fireworks AI Key",
              id: "fireworks",
              provider: "fireworks" as const,
              field: "fireworks_api_key",
              placeholder: "fw_...",
              badge: "للاستجابة الفائقة",
              color: "purple",
              hint: "مفتاح Fireworks.ai للموديلات مثل DeepSeek V4. يُستخدم عند اختيار fireworks",
            },
            {
              label: "NVIDIA NIM AI Key",
              id: "nvidia",
              provider: "nvidia" as const,
              field: "nvidia_api_key",
              placeholder: "nvapi-...",
              badge: "أداء نيفيديا المسرّع",
              color: "emerald",
              hint: "مفتاح NVIDIA NIM المسرّع للموديلات مثل Llama 3.2 و Nemotron و GPT-OSS و Kimi",
            },
            {
              label: "Custom STT Primary Key",
              id: "stt",
              provider: "gemini" as const,
              field: "stt_api_key",
              placeholder: "AIzaSy...",
              badge: "صوت أساسي",
              color: "emerald",
              hint: "مفتاح مخصص لعمليات STT فقط. مفيد للفصل بين حصص الـ AI والصوت",
            },
            {
              label: "Custom STT Backup Key",
              id: "stt2",
              provider: "gemini" as const,
              field: "stt_api_key_2",
              placeholder: "AIzaSy...",
              badge: "صوت احتياطي",
              color: "slate",
              hint: "مفتاح STT احتياطي عند فشل المفتاح الأساسي للصوت",
            },
          ].map(({ label, id, provider, field, placeholder, badge, hint }) => {
            const vState = validationResults[field];
            return (
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
                          : field.includes("nvidia")
                            ? "🚀"
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
                <div className="flex items-center justify-between pt-1 gap-2">
                  <p className="text-xs text-muted-foreground">
                    المعرف:{" "}
                    <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                      {id}
                    </code>
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!formData[field] || vState?.loading}
                    onClick={() => handleValidate(provider, field)}
                    className="h-8 text-xs gap-1.5"
                  >
                    {vState?.loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                        جارٍ الفحص...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                        اختبار المفتاح
                      </>
                    )}
                  </Button>
                </div>
                {vState && !vState.loading && (
                  <div
                    className={`text-xs p-2 rounded-lg flex items-center gap-2 mt-2 ${
                      vState.valid
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {vState.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{vState.message || (vState.valid ? "المفتاح يعمل بشكل سليم ✅" : "المفتاح غير صالح")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* RAG Settings */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-purple-500">
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
                    <Badge
                      variant="outline"
                      className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200"
                    >
                      New
                    </Badge>
                  </Label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    يقوم بمطابقة معاملات المستخدم الجديدة مع تاريخه القديم لزيادة
                    الدقة وتقليل الهلوسة
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
    </div>
  );
}
