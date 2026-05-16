import React, { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Save, Sliders, Mic, Gift, Calendar, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export function AdminSettingsTab() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery();
  const { data: modelsData } = trpc.admin.getAvailableModels.useQuery();
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الإعدادات بنجاح ✅");
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
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">إعدادات النظام الذكي</h2>
          <p className="text-sm text-muted-foreground">تحكم كامل في سلوك الذكاء الاصطناعي وحدود الباقات.</p>
        </div>
        <Button onClick={handleSubmit} disabled={updateSettings.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {updateSettings.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList className="mb-6 bg-muted/50 w-full justify-start h-auto flex-wrap p-1 rounded-xl">
          <TabsTrigger value="ai" className="gap-2 py-2 px-4 rounded-lg"><Brain className="w-4 h-4"/> الذكاء الاصطناعي</TabsTrigger>
          <TabsTrigger value="limits" className="gap-2 py-2 px-4 rounded-lg"><Sliders className="w-4 h-4"/> حدود الباقات</TabsTrigger>
          <TabsTrigger value="voice" className="gap-2 py-2 px-4 rounded-lg"><Mic className="w-4 h-4"/> التسجيل الصوتي</TabsTrigger>
          <TabsTrigger value="marketing" className="gap-2 py-2 px-4 rounded-lg"><Gift className="w-4 h-4"/> الصلاحيات</TabsTrigger>
          <TabsTrigger value="codes" className="gap-2 py-2 px-4 rounded-lg"><Calendar className="w-4 h-4"/> أكواد الخصم</TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          {/* TAB 1: AI Settings */}
          <TabsContent value="ai" className="space-y-6 animate-in fade-in-50 duration-500">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🔑 مفاتيح Gemini API</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini API Key (الأساسي)</label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key || ""} onChange={(e) => updateField("ai_api_key", e.target.value)} dir="ltr" />
                  <p className="text-xs text-muted-foreground">مفتاح Google AI Studio للطلبات الأساسية</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini API Key 2 (الاحتياطي)</label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key_2 || ""} onChange={(e) => updateField("ai_api_key_2", e.target.value)} dir="ltr" />
                  <p className="text-xs text-muted-foreground">مفتاح احتياطي يعمل تلقائياً عند استنفاذ الأول</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🤖 اختيار الموديلات للتحليل</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { key: "ai_model_free", label: "موديل المجاني", desc: "للمستخدمين المجانيين" },
                    { key: "ai_model_pro", label: "موديل البرو", desc: "لمشتركين البرو" },
                    { key: "ai_model_ultra", label: "موديل الألترا", desc: "لمشتركين الألترا" },
                    { key: "ai_model_reports", label: "موديل التقارير", desc: "للتحليلات الشهرية" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="space-y-2">
                      <label className="text-sm font-medium">{label}</label>
                      <Select value={formData[key] || ""} onValueChange={(v) => updateField(key, v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="اختر موديل" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex items-center gap-2">
                                <span>{m.name}</span>
                                <Badge variant="outline" className="text-[10px] h-4 px-1">{m.tier}</Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🧠 شخصية وتعليمات الذكاء الاصطناعي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">طول الرد التحليلي</label>
                    <Select value={formData.ai_response_length || "medium"} onValueChange={(v) => updateField("ai_response_length", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="اختر طول الرد" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">مختصر جداً</SelectItem>
                        <SelectItem value="medium">متوسط (متوازن)</SelectItem>
                        <SelectItem value="detailed">تحليلي متعمق ومفصل</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">يتحكم في طول وكثافة الشرح في تقارير الذكاء الاصطناعي.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">تركيز التحليل</label>
                    <Select value={formData.ai_focus || "balanced"} onValueChange={(v) => updateField("ai_focus", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="اختر التركيز" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">متوازن (نصائح وإحصائيات)</SelectItem>
                        <SelectItem value="statistics">الإحصائيات والأرقام فقط</SelectItem>
                        <SelectItem value="tips">النصائح المالية والتوفير</SelectItem>
                        <SelectItem value="patterns">الأنماط السلوكية الاستهلاكية</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">يحدد الجانب الذي يركز عليه الذكاء الاصطناعي أكثر في رده.</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">نص تعليمات النظام (System Prompt)</label>
                  <textarea 
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.ai_system_prompt || ""}
                    onChange={(e) => updateField("ai_system_prompt", e.target.value)}
                    dir="rtl"
                    placeholder="أدخل نص التعليمات الأساسية الذي سيتحكم في شخصية المساعد الذكي..."
                  />
                  <p className="text-[10px] text-muted-foreground">هذا النص هو الذي يتحكم في شخصية الذكاء الاصطناعي وطريقة رده بالكامل.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🎯 حدود الثقة للتصنيف التلقائي (0-100)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: "confidence_auto_save", label: "الحفظ التلقائي", desc: "أعلى من القيمة دي هيتحفظ فوراً" },
                    { key: "confidence_review", label: "المراجعة", desc: "أعلى من دي وأقل من الحفظ هيظهر في المراجعة" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="space-y-2">
                      <label className="text-sm font-medium">{label}</label>
                      <Input type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Limits & Quotas */}
          <TabsContent value="limits" className="space-y-6 animate-in fade-in-50 duration-500">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">📅 حدود التقارير الشهرية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: "report_limit_free", label: "مجاني", desc: "0 = مفتوح بلا قيود | 1 = تقرير يومي | 30 = تقرير شهري" },
                    { key: "report_limit_pro", label: "برو", desc: "0 = مفتوح بلا قيود | 1 = تقرير يومي | 14 = تقريرين بالشهر" },
                    { key: "report_limit_ultra", label: "ألترا", desc: "0 = مفتوح بلا قيود | 1 = تقرير يومي" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="space-y-2">
                      <label className="text-sm font-medium">أيام الانتظار - {label}</label>
                      <Input type="number" dir="ltr" min="0" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🎫 حدود التوكنز (إجمالي رصيد الاستخدام)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: "free_token_limit", label: "مجاني", color: "text-slate-600" },
                    { key: "pro_token_limit", label: "برو", color: "text-blue-600" },
                    { key: "ultra_token_limit", label: "ألترا", color: "text-purple-600" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="space-y-2">
                      <label className={`text-sm font-medium ${color}`}>حد التوكنز - {label}</label>
                      <Input type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">📊 الحد اليومي للطلبات</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { key: "free_daily_limit", label: "مجاني" },
                      { key: "pro_daily_limit", label: "برو" },
                      { key: "ultra_daily_limit", label: "ألترا" },
                    ].map(({ key, label }) => (
                      <div key={key} className="space-y-2 flex justify-between items-center">
                        <label className="text-sm font-medium">طلبات يومية - {label}</label>
                        <Input className="w-24" type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">⚡ أقصى توكنز للطلب الواحد</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { key: "free_max_per_request", label: "مجاني" },
                      { key: "pro_max_per_request", label: "برو" },
                      { key: "ultra_max_per_request", label: "ألترا" },
                    ].map(({ key, label }) => (
                      <div key={key} className="space-y-2 flex justify-between items-center">
                        <label className="text-sm font-medium">حد الطلب - {label}</label>
                        <Input className="w-24" type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Report Generation Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">📝 التحكم في التقارير الشهرية (الطول والعمق)</CardTitle>
                <CardDescription>تحكم دقيق في عدد الكلمات والبيانات التي يتلقاها الذكاء الاصطناعي لكل خطة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold mb-3 border-b pb-2">🎯 عدد الكلمات المستهدف في التقرير</h4>
                  <p className="text-[10px] text-muted-foreground mb-3">الرقم التقريبي لعدد الكلمات التي سيُطلب من الذكاء الاصطناعي كتابتها. أرقام أكبر = تقرير أطول = تكلفة أعلى.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "report_words_free", label: "مجاني", desc: "550 = ~400-700 كلمة", color: "text-slate-600" },
                      { key: "report_words_pro", label: "برو", desc: "850 = ~700-1000 كلمة", color: "text-blue-600" },
                      { key: "report_words_ultra", label: "ألترا", desc: "1500 = 1000+ كلمة", color: "text-purple-600" },
                    ].map(({ key, label, desc, color }) => (
                      <div key={key} className="space-y-2">
                        <label className={`text-sm font-medium ${color}`}>كلمات - {label}</label>
                        <Input type="number" dir="ltr" min="100" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold mb-3 border-b pb-2">🔒 شبكة أمان التوكنز (Max Output Tokens)</h4>
                  <p className="text-[10px] text-muted-foreground mb-3">الحد الأقصى الفعلي للتوكنز التي يمكن أن يولدها الذكاء الاصطناعي في التقرير الواحد. يمنع الاستهلاك الزائد.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "report_max_tokens_free", label: "مجاني", desc: "1800 ≈ 700 كلمة كحد أقصى" },
                      { key: "report_max_tokens_pro", label: "برو", desc: "3500 ≈ 1400 كلمة كحد أقصى" },
                      { key: "report_max_tokens_ultra", label: "ألترا", desc: "8192 = عمق غير محدود تقريباً" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">حد توكنز التقرير - {label}</label>
                        <Input type="number" dir="ltr" min="200" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold mb-3 border-b pb-2">📊 عمق البيانات المُرسلة للذكاء الاصطناعي</h4>
                  <p className="text-[10px] text-muted-foreground mb-3">كمية التفاصيل (فئات فرعية + أوصاف عمليات) التي تُغذّى للذكاء الاصطناعي. بيانات أكثر = تحليل أعمق.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "report_subcats_free", label: "فئات فرعية - مجاني", desc: "عدد الفئات الفرعية" },
                      { key: "report_subcats_pro", label: "فئات فرعية - برو", desc: "عدد الفئات الفرعية" },
                      { key: "report_subcats_ultra", label: "فئات فرعية - ألترا", desc: "عدد الفئات الفرعية" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">{label}</label>
                        <Input type="number" dir="ltr" min="0" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {[
                      { key: "report_top_items_pro", label: "أوصاف عمليات - برو", desc: "عدد أوصاف العمليات الأكثر تكراراً/قيمة التي تُرسل" },
                      { key: "report_top_items_ultra", label: "أوصاف عمليات - ألترا", desc: "عدد أوصاف العمليات الأكثر تكراراً/قيمة التي تُرسل" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">{label}</label>
                        <Input type="number" dir="ltr" min="0" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Voice Settings */}
          <TabsContent value="voice" className="space-y-6 animate-in fade-in-50 duration-500">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🗣️ إعدادات محرك الصوت (STT)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-xl">
                  <label className="text-sm font-medium">STT API Key</label>
                  <Input type="password" placeholder="AIzaSy..." value={formData.stt_api_key || ""} onChange={(e) => updateField("stt_api_key", e.target.value)} dir="ltr" />
                  <p className="text-xs text-muted-foreground">مفتاح خاص لعمليات تحويل الصوت لنص</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">الموديل الأساسي (STT)</label>
                    <Select value={formData.stt_model || ""} onValueChange={(v) => updateField("stt_model", v)}>
                      <SelectTrigger className="h-9" dir="ltr"><SelectValue placeholder="اختر الموديل الأساسي" /></SelectTrigger>
                      <SelectContent>
                        {models.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <span>{m.name}</span><Badge variant="outline" className="text-[10px] h-4 px-1">{m.tier}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">الموديل الاحتياطي (Fallback)</label>
                    <Select value={formData.stt_fallback_model || ""} onValueChange={(v) => updateField("stt_fallback_model", v)}>
                      <SelectTrigger className="h-9" dir="ltr"><SelectValue placeholder="اختر الموديل الاحتياطي" /></SelectTrigger>
                      <SelectContent>
                        {models.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <span>{m.name}</span><Badge variant="outline" className="text-[10px] h-4 px-1">{m.tier}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <label className="text-sm font-medium">نظام معالجة الصوت (STT Mode)</label>
                  <Select value={formData.stt_processing_mode || "standard"} onValueChange={(v) => updateField("stt_processing_mode", v)}>
                    <SelectTrigger className="h-9 max-w-sm" dir="ltr"><SelectValue placeholder="اختر نظام المعالجة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Inline (الوضع الافتراضي)</SelectItem>
                      <SelectItem value="live_api">Live API Session (للأداء الحي السريع)</SelectItem>
                      <SelectItem value="native_audio">Native Audio Dialog (مخصص للصوت العالي)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🎤 حدود التسجيل الصوتي (بالثواني)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold mb-3 border-b pb-2">الحد الشهري التراكمي للتسجيل</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "voice_limit_free", label: "مجاني", desc: "300 = 5 دقائق" },
                      { key: "voice_limit_pro", label: "برو", desc: "1800 = 30 دقيقة" },
                      { key: "voice_limit_ultra", label: "ألترا", desc: "0 = غير محدود" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">شهري - {label}</label>
                        <Input type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <h4 className="text-sm font-bold mb-3 border-b pb-2">أقصى مدة للتسجيل الواحد</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "voice_per_req_free", label: "مجاني", desc: "مثال: 60 (دقيقة واحدة)" },
                      { key: "voice_per_req_pro", label: "برو", desc: "مثال: 180 (3 دقائق)" },
                      { key: "voice_per_req_ultra", label: "ألترا", desc: "مثال: 300 (5 دقائق)" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="space-y-2">
                        <label className="text-sm font-medium">للمرة الواحدة - {label}</label>
                        <Input type="number" dir="ltr" value={formData[key] || ""} onChange={(e) => updateField(key, e.target.value)} />
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Marketing & Permissions */}
          <TabsContent value="marketing" className="space-y-6 animate-in fade-in-50 duration-500">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🎁 التسويق ورموز الدعوة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">خصم كود الإحالة (%)</label>
                    <div className="relative">
                      <Input type="number" dir="ltr" value={formData.promo_code_discount || ""} onChange={(e) => updateField("promo_code_discount", e.target.value)} />
                      <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">نسبة الخصم التي يحصل عليها المستخدم عند إدخال كود دعوة.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🔧 صلاحيات الميزات للباقات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {["free", "pro", "ultra"].map((plan) => (
                    <div key={plan} className="border rounded-lg p-4 space-y-3 bg-muted/10">
                      <h4 className="font-bold text-sm capitalize flex items-center gap-2">
                        {plan === "free" ? "🆓 مجاني" : plan === "pro" ? "⭐ برو" : "💎 ألترا"}
                      </h4>
                      <div className="space-y-3 pt-2">
                        {[
                          { key: `${plan}_ai_parse`, label: "تحليل الرسائل بالـ AI" },
                          { key: `${plan}_ai_analysis`, label: "التحليل الشهري بالـ AI" },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center justify-between gap-2 text-sm cursor-pointer border-b pb-2 last:border-0 last:pb-0">
                            <span>{label}</span>
                            <div className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={formData[key] !== "false"} onChange={(e) => updateField(key, e.target.checked ? "true" : "false")} />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: Discount Codes */}
          <TabsContent value="codes" className="space-y-6 animate-in fade-in-50 duration-500">
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
    onSuccess: () => { toast.success("تم إنشاء الكود ✅"); utils.admin.getDiscountCodes.invalidate(); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteCode = trpc.admin.deleteDiscountCode.useMutation({
    onSuccess: () => { toast.success("تم حذف الكود"); utils.admin.getDiscountCodes.invalidate(); },
  });

  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("20");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">إدارة أكواد الخصم</h3>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" />
          كود جديد
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">الكود</label>
                <Input placeholder="SAVE20" dir="ltr" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">نسبة الخصم %</label>
                <Input type="number" dir="ltr" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">أقصى استخدام (فارغ = لا نهائي)</label>
                <Input type="number" dir="ltr" placeholder="∞" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">ينتهي في (اختياري)</label>
                <Input type="date" dir="ltr" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
              </div>
            </div>
            <Button className="mt-4 gap-2" disabled={!newCode || createCode.isPending} onClick={() => createCode.mutate({
              code: newCode, discountPercent: Number(newDiscount) || 20,
              maxUses: newMaxUses ? Number(newMaxUses) : undefined,
              expiresAt: newExpiry || undefined,
            })}>
              {createCode.isPending ? "جاري الإنشاء..." : "إنشاء الكود"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? <p className="text-center text-muted-foreground py-4">جاري التحميل...</p> : (
            <div className="space-y-2">
              {(!codes || codes.length === 0) && <p className="text-center text-muted-foreground py-4">لا توجد أكواد بعد</p>}
              {codes?.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded">{c.code}</span>
                    <Badge variant="outline">{c.discountPercent}% خصم</Badge>
                    <span className="text-xs text-muted-foreground">{c.usedCount || 0}{c.maxUses ? `/${c.maxUses}` : ""} استخدام</span>
                    {c.expiresAt && <span className="text-xs text-muted-foreground">ينتهي: {new Date(c.expiresAt).toLocaleDateString("ar-EG")}</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700" onClick={() => deleteCode.mutate({ id: c.id })}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
