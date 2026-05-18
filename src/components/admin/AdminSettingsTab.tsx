import React, { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Brain, Save, Sliders, Mic, ShieldCheck, Calendar, Trash2, Plus, Sparkles, AlertCircle, Terminal, Key } from "lucide-react";
import { toast } from "sonner";

export function AdminSettingsTab() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery();
  const { data: modelsData } = trpc.admin.getAvailableModels.useQuery();
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث إعدادات النظام بنجاح");
      refetch();
    },
    onError: () => toast.error("حدث خطأ أثناء التحديث"),
  });

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (settings && !isLoaded) {
      setFormData({ ...settings });
      setIsLoaded(true);
    }
  }, [settings, isLoaded]);

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(formData);
  };

  const models = modelsData?.models || [];

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-500 pb-20" dir="rtl">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">إدارة النظام المركزية</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            تحكم شامل في جميع خصائص الذكاء الاصطناعي، الصلاحيات، والباقات.
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={updateSettings.isPending} size="lg" className="gap-2 shadow-md">
          <Save className="w-5 h-5" />
          {updateSettings.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="mb-8 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl flex-wrap h-auto gap-1 border shadow-sm w-fit">
          <TabsTrigger value="ai" className="gap-2 py-2.5 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Brain className="w-4 h-4 text-indigo-500"/> محرك الذكاء</TabsTrigger>
          <TabsTrigger value="limits" className="gap-2 py-2.5 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Sliders className="w-4 h-4 text-emerald-500"/> الحدود والباقات</TabsTrigger>
          <TabsTrigger value="voice" className="gap-2 py-2.5 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Mic className="w-4 h-4 text-rose-500"/> المحرك الصوتي</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2 py-2.5 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><ShieldCheck className="w-4 h-4 text-blue-500"/> الصلاحيات</TabsTrigger>
          <TabsTrigger value="codes" className="gap-2 py-2.5 px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><Calendar className="w-4 h-4 text-amber-500"/> العروض والخصومات</TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          {/* ────────────────────────────────────────────────────────────
              TAB 1: AI Engine Configuration 
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="ai" className="space-y-8">
            
            {/* API Keys */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2"><Key className="w-5 h-5 text-slate-500" /> مفاتيح الوصول (API Keys)</CardTitle>
                <CardDescription className="mt-1">المفاتيح المطلوبة لربط النظام بخوادم Google Gemini</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Gemini API Key (المفتاح الأساسي)</Label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key || ""} onChange={(e) => updateField("ai_api_key", e.target.value)} dir="ltr" className="font-mono" />
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3"/> يُستخدم لجميع طلبات الذكاء الاصطناعي الافتراضية</p>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Gemini API Key 2 (الاحتياطي / Failover)</Label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key_2 || ""} onChange={(e) => updateField("ai_api_key_2", e.target.value)} dir="ltr" className="font-mono" />
                  <p className="text-xs text-muted-foreground">يعمل بشكل تلقائي لتجنب توقف الخدمة حال انتهاء رصيد المفتاح الأول</p>
                </div>
              </CardContent>
            </Card>

            {/* Model Selection */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2"><Brain className="w-5 h-5 text-indigo-500" /> توجيه النماذج (Model Routing)</CardTitle>
                <CardDescription className="mt-1">حدد النماذج المستخدمة لكل شريحة من المستخدمين</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { key: "ai_model_free", label: "الباقة المجانية", desc: "ينصح بنموذج Flash الاقتصادي" },
                  { key: "ai_model_pro", label: "باقة البرو", desc: "ينصح بنموذج متوازن" },
                  { key: "ai_model_ultra", label: "باقة الألترا", desc: "النموذج الأقوى (Pro)" },
                  { key: "ai_model_reports", label: "محرك التقارير", desc: "لتحليل البيانات الضخمة (تقارير شهرية)" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="space-y-3 bg-slate-50/50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                    <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">{label}</Label>
                    <Select value={formData[key] || ""} onValueChange={(v) => updateField(key, v)}>
                      <SelectTrigger className="bg-white dark:bg-slate-950">
                        <SelectValue placeholder="اختر الموديل" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <span>{m.name}</span>
                              <Badge variant="secondary" className="text-[10px] py-0">{m.tier}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Advanced Prompt Engineering */}
            <Card className="border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-indigo-500">
              <div className="bg-indigo-50/30 dark:bg-indigo-950/20 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2"><Terminal className="w-5 h-5 text-indigo-600" /> هندسة الأوامر (Prompt Engineering)</CardTitle>
                <CardDescription className="mt-1">تحكم مطلق في تفاصيل، مخرجات، وشخصية التقارير الذكية.</CardDescription>
              </div>
              <CardContent className="p-6 space-y-8">
                {/* Tone & Focus */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">نمط الإخراج (طول التقرير)</Label>
                    <Select value={formData.ai_response_length || "medium"} onValueChange={(v) => updateField("ai_response_length", v)}>
                      <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="اختر الإخراج" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">موجز تنفيذي (Executive Summary) - مباشر ومختصر</SelectItem>
                        <SelectItem value="medium">متوازن - الأفضل للاستخدام العادي</SelectItem>
                        <SelectItem value="detailed">تحليل مفصل وعميق - يغطي كافة الجوانب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">بؤرة التحليل (التركيز الرئيسي)</Label>
                    <Select value={formData.ai_focus || "balanced"} onValueChange={(v) => updateField("ai_focus", v)}>
                      <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="اختر التركيز" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">متوازن (إحصائيات ونصائح معاً)</SelectItem>
                        <SelectItem value="statistics">تحليلات إحصائية وأرقام بحتة</SelectItem>
                        <SelectItem value="tips">توصيات عملية وخطط توفير استراتيجية</SelectItem>
                        <SelectItem value="patterns">اكتشاف الأنماط السلوكية الاستهلاكية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Persona */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold">الشخصية والقواعد الأساسية (System Prompt)</Label>
                      <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">الأساسيات</Badge>
                    </div>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900 leading-relaxed"
                      value={formData.ai_system_prompt || ""}
                      onChange={(e) => updateField("ai_system_prompt", e.target.value)}
                      dir="rtl"
                      placeholder="أدخل نص التعليمات الأساسية لشخصية المساعد..."
                    />
                    <p className="text-xs text-muted-foreground">يُحدد أسلوب التحدث، اللهجة، والمبادئ الأساسية التي لا يتخطاها الذكاء الاصطناعي.</p>
                  </div>

                  {/* Advanced Custom Instructions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold">تعليمات صياغة إضافية (Advanced Instructions)</Label>
                      <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">متقدم</Badge>
                    </div>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900 leading-relaxed"
                      value={formData.ai_advanced_instructions || ""}
                      onChange={(e) => updateField("ai_advanced_instructions", e.target.value)}
                      dir="rtl"
                      placeholder="أضف أوامر دقيقة حول كيفية تحليل البيانات وصياغتها. اتركها فارغة لاستخدام التعليمات الافتراضية."
                    />
                    <p className="text-xs text-muted-foreground">أوامر حاسمة تُطبق على مخرجات التقرير (مثلاً: ركز على بند كذا، استخدم تنسيق كذا). تدمج مباشرة في الـ Prompt.</p>
                  </div>

                  {/* Structure Override */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold">الهيكل الإلزامي المخصص (Structure Override)</Label>
                      <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">إلغاء وتجاوز الافتراضي</Badge>
                    </div>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900 leading-relaxed"
                      value={formData.ai_report_structure_override || ""}
                      onChange={(e) => updateField("ai_report_structure_override", e.target.value)}
                      dir="rtl"
                      placeholder="مثال: القسم الأول: نظرة عامة. القسم الثاني: فئات محددة... (يترك فارغاً لاستخدام الهيكل الديناميكي التلقائي بناءً على الباقة)"
                    />
                    <p className="text-xs text-muted-foreground font-medium text-rose-600/80">تنبيه: ملء هذا الحقل سيُلغي هيكل التقارير المبرمج مسبقاً في النظام تماماً، ويُجبر الموديل على اتباع هذا الهيكل.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Thresholds */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /> دقة التصنيف الآلي (Confidence Engine)</CardTitle>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3 bg-green-50/50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-900">
                  <Label className="text-sm font-bold text-green-700 dark:text-green-400">عتبة الحفظ التلقائي (Auto Save)</Label>
                  <Input type="number" dir="ltr" value={formData.confidence_auto_save || ""} onChange={(e) => updateField("confidence_auto_save", e.target.value)} className="bg-white dark:bg-slate-950 font-mono text-lg" />
                  <p className="text-xs text-muted-foreground">إذا كانت دقة النظام أعلى من هذا الرقم (0-100)، تُحفظ العملية دون الرجوع للمستخدم.</p>
                </div>
                <div className="space-y-3 bg-orange-50/50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900">
                  <Label className="text-sm font-bold text-orange-700 dark:text-orange-400">عتبة المراجعة (Review Queue)</Label>
                  <Input type="number" dir="ltr" value={formData.confidence_review || ""} onChange={(e) => updateField("confidence_review", e.target.value)} className="bg-white dark:bg-slate-950 font-mono text-lg" />
                  <p className="text-xs text-muted-foreground">ما بين هذا الرقم وعتبة الحفظ التلقائي يتم وضعه في قائمة المراجعة.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              TAB 2: Limits & Quotas 
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="limits" className="space-y-8">
            {/* Report Frequency Limits */}
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
              <div className="bg-indigo-50/30 dark:bg-indigo-900/20 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2">📅 التحكم في عدد التقارير الشهرية</CardTitle>
                <CardDescription className="mt-1">أدخل فترة الانتظار بالأيام بين التقرير والآخر. لجعله غير محدود (Unlimited)، أدخل 0.</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { key: "report_limit_free", label: "الباقة المجانية", desc: "مثال: 30 (تقرير كل شهر) أو 0 (بلا قيود)" },
                  { key: "report_limit_pro", label: "باقة البرو", desc: "مثال: 14 (تقرير كل أسبوعين)" },
                  { key: "report_limit_ultra", label: "باقة الألترا", desc: "مثال: 0 (مفتوح بلا قيود)" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="space-y-3 p-4 border dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                    <Label className="font-bold text-slate-800 dark:text-slate-200">{label}</Label>
                    <div className="relative">
                      <Input type="number" dir="ltr" min="0" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} className="font-mono text-center pr-10 dark:bg-slate-950 text-lg" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">يوم</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Tokens Limits */}
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2">⛽ الرصيد الشهري (الرموز / Tokens)</CardTitle>
                <CardDescription className="mt-1">الحد الأقصى التراكمي لاستهلاك الموارد الذكية لكل مستخدم شهرياً.</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { key: "free_token_limit", label: "الباقة المجانية", badge: "Free" },
                  { key: "pro_token_limit", label: "باقة البرو", badge: "Pro" },
                  { key: "ultra_token_limit", label: "باقة الألترا", badge: "Ultra" },
                ].map(({ key, label, badge }) => (
                  <div key={key} className="space-y-3 p-4 border dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex justify-between items-center"><Label className="font-bold">{label}</Label><Badge variant="secondary">{badge}</Badge></div>
                    <Input type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} className="font-mono text-center" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* SMS Processing Limits */}
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-blue-500">
              <div className="bg-blue-50/30 dark:bg-blue-900/20 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2">📱 رسائل الـ SMS الآلية</CardTitle>
                <CardDescription className="mt-1">عدد عمليات القراءة الآلية للرسائل البنكية شهرياً لكل باقة.</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { key: "sms_limit_free", label: "الباقة المجانية", desc: "ينصح بـ 5 رسائل للتجربة" },
                  { key: "sms_limit_pro", label: "باقة البرو", desc: "ينصح بعدد كبير أو 999999" },
                  { key: "sms_limit_ultra", label: "باقة الألترا", desc: "غير محدود (999999)" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="space-y-3 p-4 border dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                    <Label className="font-bold text-slate-800 dark:text-slate-200">{label}</Label>
                    <div className="relative">
                      <Input type="number" dir="ltr" min="0" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} className="font-mono text-center pr-10 dark:bg-slate-950 text-lg" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">رسالة</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Daily Requests Limits */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                  <CardTitle className="text-lg">سقف الطلبات اليومي</CardTitle>
                  <CardDescription>عدد عمليات التحليل المسموح بها يومياً.</CardDescription>
                </div>
                <CardContent className="p-6 space-y-5">
                  {[
                    { key: "free_daily_limit", label: "المجانية" },
                    { key: "pro_daily_limit", label: "البرو" },
                    { key: "ultra_daily_limit", label: "الألترا" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex justify-between items-center pb-4 border-b last:border-0 last:pb-0">
                      <Label className="font-medium text-slate-700 dark:text-slate-300">طلبات {label}</Label>
                      <Input className="w-32 font-mono text-center" type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Tokens per Request */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                  <CardTitle className="text-lg">سعة المعالجة للطلب الواحد</CardTitle>
                  <CardDescription>أقصى حجم للردود لكل طلب تحليل عادي.</CardDescription>
                </div>
                <CardContent className="p-6 space-y-5">
                  {[
                    { key: "free_max_per_request", label: "المجانية" },
                    { key: "pro_max_per_request", label: "البرو" },
                    { key: "ultra_max_per_request", label: "الألترا" },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex justify-between items-center pb-4 border-b last:border-0 last:pb-0">
                      <Label className="font-medium text-slate-700 dark:text-slate-300">حد إخراج {label}</Label>
                      <Input className="w-32 font-mono text-center" type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Smart Reports Dimensions */}
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-emerald-500">
              <div className="bg-emerald-50/30 dark:bg-emerald-950/20 border-b px-6 py-5">
                <CardTitle className="text-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-400">📊 هندسة التقارير والتحليل العميق</CardTitle>
                <CardDescription className="mt-1">أبعاد وعمق البيانات التي يتم ضخها في محرك التقارير الدورية لإنتاج "تقارير مشبعة".</CardDescription>
              </div>
              
              <CardContent className="p-0">
                {/* Section A: Content Generation Limits */}
                <div className="p-6 border-b bg-white dark:bg-slate-950">
                  <h4 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-sm">1</span> 
                    أبعاد توليد المحتوى
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <Label className="text-sm text-muted-foreground border-b pb-2 w-full block">الكلمات المستهدفة (Target Length)</Label>
                      {[
                        { key: "report_words_free", label: "المجاني", desc: "≈ 500 كلمة" },
                        { key: "report_words_pro", label: "البرو", desc: "≈ 800 كلمة" },
                        { key: "report_words_ultra", label: "الألترا", desc: "1000+ كلمة" },
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center gap-4">
                          <Label className="w-20 font-bold">{label}</Label>
                          <Input type="number" dir="ltr" className="w-24 font-mono text-center" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <Label className="text-sm text-muted-foreground border-b pb-2 w-full block">الحد الأقصى الفعلي (Safety Net Tokens)</Label>
                      {[
                        { key: "report_max_tokens_free", label: "المجاني", desc: "لحماية رصيد الموارد" },
                        { key: "report_max_tokens_pro", label: "البرو", desc: "متوسط 3500 توكن" },
                        { key: "report_max_tokens_ultra", label: "الألترا", desc: "أقصى عمق (8192)" },
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center gap-4">
                          <Label className="w-20 font-bold">{label}</Label>
                          <Input type="number" dir="ltr" className="w-24 font-mono text-center" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section B: Data Saturation (Context Feed) */}
                <div className="p-6 bg-slate-50/50 dark:bg-slate-900/30">
                  <h4 className="text-lg font-bold mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-sm">2</span> 
                    إشباع البيانات (Data Saturation)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <Label className="text-sm text-muted-foreground border-b pb-2 w-full block">عدد الفئات الفرعية المرسلة للمحرك</Label>
                      {[
                        { key: "report_subcats_free", label: "المجاني" },
                        { key: "report_subcats_pro", label: "البرو" },
                        { key: "report_subcats_ultra", label: "الألترا" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-4">
                          <Label className="w-20 font-bold">{label}</Label>
                          <Input type="number" dir="ltr" className="w-24 font-mono text-center" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <Label className="text-sm text-muted-foreground border-b pb-2 w-full block">أوصاف وعمليات فردية مفصلة (Top Items)</Label>
                      {[
                        { key: "report_top_items_pro", label: "البرو", desc: "مثال: أوبر، جرير.." },
                        { key: "report_top_items_ultra", label: "الألترا", desc: "أقصى عمق تحليلي" },
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center gap-4">
                          <Label className="w-20 font-bold">{label}</Label>
                          <Input type="number" dir="ltr" className="w-24 font-mono text-center" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              TAB 3: Voice Engine Settings
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="voice" className="space-y-8">
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg flex items-center gap-2">مفاتيح ونماذج الصوت (STT Setup)</CardTitle>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-3 max-w-2xl">
                  <Label className="text-sm font-bold">STT API Key (مفتاح خاص لخدمات الصوت)</Label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.stt_api_key || ""} onChange={(e) => updateField("stt_api_key", e.target.value)} dir="ltr" className="font-mono" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border dark:border-slate-800">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">الموديل الأساسي للتحويل الصوتي</Label>
                    <Select value={formData.stt_model || ""} onValueChange={(v) => updateField("stt_model", v)}>
                      <SelectTrigger className="h-10 bg-white dark:bg-slate-950" dir="ltr"><SelectValue placeholder="اختر الموديل الأساسي" /></SelectTrigger>
                      <SelectContent>
                        {models.map((m: any) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">الموديل الاحتياطي (Fallback STT)</Label>
                    <Select value={formData.stt_fallback_model || ""} onValueChange={(v) => updateField("stt_fallback_model", v)}>
                      <SelectTrigger className="h-10 bg-white dark:bg-slate-950" dir="ltr"><SelectValue placeholder="اختر الموديل الاحتياطي" /></SelectTrigger>
                      <SelectContent>
                        {models.map((m: any) => (<SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 max-w-md">
                  <Label className="text-sm font-bold">نظام معالجة تدفق الصوت (Processing Mode)</Label>
                  <Select value={formData.stt_processing_mode || "standard"} onValueChange={(v) => updateField("stt_processing_mode", v)}>
                    <SelectTrigger className="h-10" dir="ltr"><SelectValue placeholder="اختر النظام" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Inline (قياسي ومستقر)</SelectItem>
                      <SelectItem value="live_api">Live API Session (أداء حي وسريع جداً)</SelectItem>
                      <SelectItem value="native_audio">Native Audio Dialog (جودة نقية عالية)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg">حصص الاستهلاك الصوتي (بالثواني)</CardTitle>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-5">
                  <Label className="text-sm font-bold text-slate-800 border-b pb-2 w-full block">الحد الأقصى للشهر الكامل (التراكمي)</Label>
                  {[
                    { key: "voice_limit_free", label: "الباقة المجانية", desc: "300 = 5 دقائق" },
                    { key: "voice_limit_pro", label: "باقة البرو", desc: "1800 = 30 دقيقة" },
                    { key: "voice_limit_ultra", label: "باقة الألترا", desc: "0 = غير محدود" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-800">
                      <div><p className="font-bold text-sm">{label}</p><p className="text-[10px] text-muted-foreground">{desc}</p></div>
                      <Input type="number" dir="ltr" className="w-24 font-mono text-center dark:bg-slate-950" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                    </div>
                  ))}
                </div>

                <div className="space-y-5">
                  <Label className="text-sm font-bold text-slate-800 border-b pb-2 w-full block">أقصى مدة للتسجيل الواحد المستمر</Label>
                  {[
                    { key: "voice_per_req_free", label: "الباقة المجانية", desc: "60 = دقيقة" },
                    { key: "voice_per_req_pro", label: "باقة البرو", desc: "180 = 3 دقائق" },
                    { key: "voice_per_req_ultra", label: "باقة الألترا", desc: "300 = 5 دقائق" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-800">
                      <div><p className="font-bold text-sm">{label}</p><p className="text-[10px] text-muted-foreground">{desc}</p></div>
                      <Input type="number" dir="ltr" className="w-24 font-mono text-center dark:bg-slate-950" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              TAB 4: Permissions & Features Toggles 
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="permissions" className="space-y-8">
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-blue-500">
              <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                <CardTitle className="text-lg">إدارة صلاحيات الميزات (Feature Flags)</CardTitle>
                <CardDescription>تفعيل أو تعطيل الخدمات الذكية لكل مستوى اشتراك</CardDescription>
              </div>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {["free", "pro", "ultra"].map((plan) => (
                  <div key={plan} className="border rounded-xl p-5 space-y-5 bg-white dark:bg-slate-950 shadow-sm">
                    <h4 className="font-black text-lg capitalize flex items-center gap-2 pb-3 border-b">
                      {plan === "free" ? "🆓 المجانية" : plan === "pro" ? "⭐ باقة برو" : "💎 باقة ألترا"}
                    </h4>
                    <div className="space-y-4">
                      {[
                        { key: `${plan}_ai_parse`, label: "التحليل السريع للمصاريف (AI Parse)" },
                        { key: `${plan}_ai_analysis`, label: "محرك التقارير الدورية (AI Analysis)" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <Label className="text-sm leading-snug cursor-pointer">{label}</Label>
                          <Switch 
                            checked={formData[key] !== "false"} 
                            onCheckedChange={(checked) => updateField(key, checked ? "true" : "false")}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              TAB 5: Discount Codes
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="codes" className="space-y-8">
             <Card className="border-slate-200 shadow-sm overflow-hidden">
               <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                 <CardTitle className="text-lg">إعدادات الإحالة العامة</CardTitle>
               </div>
               <CardContent className="p-6">
                 <div className="max-w-md space-y-3">
                   <Label className="text-sm font-bold">نسبة الخصم لرمز الإحالة الأساسي (%)</Label>
                   <div className="relative">
                     <Input type="number" dir="ltr" className="font-mono text-lg py-6" value={formData.promo_code_discount || ""} onChange={(e) => updateField("promo_code_discount", e.target.value)} />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
                   </div>
                   <p className="text-xs text-muted-foreground">النسبة التي تُمنح عند إنشاء المستخدمين لرموز دعوة لأصدقائهم.</p>
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

function DiscountCodesManager() {
  const utils = trpc.useUtils();
  const { data: codes, isLoading } = trpc.admin.getDiscountCodes.useQuery();
  const createCode = trpc.admin.createDiscountCode.useMutation({
    onSuccess: () => { toast.success("تم إصدار الكود بنجاح 🎉"); utils.admin.getDiscountCodes.invalidate(); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCode = trpc.admin.deleteDiscountCode.useMutation({
    onSuccess: () => { toast.success("تم إبطال الكود"); utils.admin.getDiscountCodes.invalidate(); },
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
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
          <Plus className="w-4 h-4" />
          إصدار كود جديد
        </Button>
      </div>

      {showForm && (
        <div className="p-6 bg-slate-50/80 dark:bg-slate-900/80 border-b dark:border-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-bold">اسم الكود (إنجليزي)</Label>
              <Input placeholder="EID2024" dir="ltr" className="font-mono uppercase dark:bg-slate-950" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">نسبة الخصم %</Label>
              <Input type="number" dir="ltr" min="1" max="100" className="font-mono dark:bg-slate-950" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">أقصى عدد استخدام</Label>
              <Input type="number" dir="ltr" placeholder="لا نهائي" className="font-mono dark:bg-slate-950" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">تاريخ الانتهاء</Label>
              <Input type="date" dir="ltr" className="dark:bg-slate-950" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button className="gap-2 w-full md:w-auto" disabled={!newCode || createCode.isPending} onClick={() => createCode.mutate({
              code: newCode, discountPercent: Number(newDiscount) || 20,
              maxUses: newMaxUses ? Number(newMaxUses) : undefined,
              expiresAt: newExpiry || undefined,
            })}>
              {createCode.isPending ? "جاري الإصدار..." : "تفعيل الكود"}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {isLoading ? <div className="p-8 text-center text-slate-500">جاري تحميل البيانات...</div> : (
          <div className="divide-y">
            {(!codes || codes.length === 0) && <div className="p-8 text-center text-slate-500">لا توجد أكواد ترويجية مُفعلة حالياً.</div>}
            {codes?.map((c: any) => (
              <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 hover:bg-slate-50 transition-colors gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono font-bold text-lg bg-slate-100 dark:bg-slate-800 text-slate-800 px-3 py-1 rounded-md border border-slate-200">{c.code}</span>
                  <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">{c.discountPercent}% خصم</Badge>
                  
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-white border px-3 py-1 rounded-full shadow-sm">
                    <span className="font-bold text-slate-900">{c.usedCount || 0}</span>
                    <span className="text-muted-foreground">/</span>
                    <span>{c.maxUses ? c.maxUses : "∞"} استخدام</span>
                  </div>
                  
                  {c.expiresAt && (
                    <span className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> ينتهي: {new Date(c.expiresAt).toLocaleDateString("ar-EG")}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 self-end sm:self-auto" onClick={() => { if(confirm("إبطال هذا الكود الترويجي؟")) deleteCode.mutate({ id: c.id }) }}>
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
