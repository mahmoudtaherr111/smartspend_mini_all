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
import { Save, Terminal, Key, Route, Settings2, ShieldCheck, Sparkles, AlertCircle, Database, Lock, Calendar, Plus, Trash2, Mic, BrainCircuit } from "lucide-react";
import { toast } from "sonner";

// ── Helper Components ──
function RoutingRangesEditor({ planName, rawValue, onChange, models }: { planName: string, rawValue: string, onChange: (val: string) => void, models: any[] }) {
  let initialRanges: any[] = [];
  try { initialRanges = JSON.parse(rawValue || "[]"); } catch (e) {}
  const [ranges, setRanges] = useState<any[]>(initialRanges);
  useEffect(() => { try { setRanges(JSON.parse(rawValue || "[]")); } catch (e) {} }, [rawValue]);

  const updateRange = (index: number, key: string, value: any) => {
    const newRanges = [...ranges];
    newRanges[index][key] = value;
    setRanges(newRanges);
    onChange(JSON.stringify(newRanges));
  };
  const addRange = () => {
    const newRanges = [...ranges, { from: 0, to: null, provider: "gemini", key_slot: "key1", model: "gemini-2.0-flash" }];
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
        <div key={i} className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-950 p-4 rounded-xl border dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 text-sm font-bold text-slate-600">{i+1}</span>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">من (Tokens)</Label>
              <Input type="number" dir="ltr" className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900" value={r.from || 0} onChange={e => updateRange(i, "from", Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">إلى (Tokens)</Label>
              <Input type="number" dir="ltr" className="w-24 h-9 font-mono bg-slate-50 dark:bg-slate-900" value={r.to || ""} placeholder="لانهائي" onChange={e => updateRange(i, "to", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          
          <div className="flex-1 min-w-[200px] flex items-center gap-3 border-r pr-3 dark:border-slate-800">
            <div className="space-y-1 w-28">
              <Label className="text-[10px] text-slate-500">الإجراء (Action)</Label>
              <Select value={r.action || "route"} onValueChange={v => updateRange(i, "action", v === "route" ? undefined : v)}>
                <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="route">استخدام موديل الذكاء</SelectItem>
                  <SelectItem value="block">حظر فوري (Block)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {r.action === "block" ? (
              <div className="space-y-1 flex-1">
                <Label className="text-[10px] text-slate-500">رسالة الحظر للعميل</Label>
                <Input className="h-9 bg-rose-50/50 dark:bg-rose-950/20 text-rose-600 border-rose-200" placeholder="عفواً، لقد استنفدت رصيدك..." value={r.message || ""} onChange={e => updateRange(i, "message", e.target.value)} />
              </div>
            ) : (
              <>
                <div className="space-y-1 w-24">
                  <Label className="text-[10px] text-slate-500">الخادم</Label>
                  <Select value={r.provider || "gemini"} onValueChange={v => updateRange(i, "provider", v)}>
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Google</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-[10px] text-slate-500">الموديل الفعلي</Label>
                  <Select value={r.model || ""} onValueChange={v => updateRange(i, "model", v)}>
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900 font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {models.filter(m => r.provider === "groq" ? m.provider === "groq" : m.provider === "gemini").map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-32">
                  <Label className="text-[10px] text-slate-500">مفتاح API</Label>
                  <Select value={r.key_slot || "key1"} onValueChange={v => updateRange(i, "key_slot", v)}>
                    <SelectTrigger className="h-9 bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
                      <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
                      <SelectItem value="groq">🔑 Groq Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 self-end mb-0.5" onClick={(e) => { e.preventDefault(); removeRange(i); }}>
            <Trash2 className="w-5 h-5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="gap-2 border-dashed border-2 hover:bg-slate-50 w-full justify-center h-14 text-slate-500 font-bold bg-white" onClick={(e) => { e.preventDefault(); addRange(); }}>
        <Plus className="w-5 h-5" /> إضافة شريحة استهلاك توكنز جديدة
      </Button>
    </div>
  );
}

function SttPlanConfig({ plan, formData, updateField, models }: { plan: string, formData: any, updateField: any, models: any[] }) {
  const providerKey = `${plan}_stt_provider`;
  const modelKey = `${plan}_stt_model`;
  const slotKey = `${plan}_stt_key_slot`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">الخادم السحابي</Label>
        <Select value={formData[providerKey] || "gemini"} onValueChange={v => updateField(providerKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Google Cloud</SelectItem>
            <SelectItem value="groq">Groq Audio</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">الموديل الدقيق</Label>
        <Select value={formData[modelKey] || ""} onValueChange={v => updateField(modelKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">المفتاح المستخدم</Label>
        <Select value={formData[slotKey] || "key1"} onValueChange={v => updateField(slotKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
            <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
            <SelectItem value="groq">🔑 Groq Key</SelectItem>
            <SelectItem value="stt">🔑 STT Custom Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ReportPlanConfig({ plan, formData, updateField, models }: { plan: string, formData: any, updateField: any, models: any[] }) {
  const providerKey = `report_provider_${plan}`;
  const modelKey = `report_model_${plan}`;
  const slotKey = `report_key_slot_${plan}`;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">الخادم السحابي للتحليل</Label>
        <Select value={formData[providerKey] || "gemini"} onValueChange={v => updateField(providerKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini">Google Cloud</SelectItem>
            <SelectItem value="groq">Groq (للسرعة الفائقة)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">موديل التحليل المنطقي</Label>
        <Select value={formData[modelKey] || ""} onValueChange={v => updateField(modelKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900 font-mono text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-bold text-slate-500">المفتاح المستخدم</Label>
        <Select value={formData[slotKey] || "key1"} onValueChange={v => updateField(slotKey, v)}>
          <SelectTrigger className="bg-slate-50 dark:bg-slate-900"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="key1">🔑 Gemini Primary</SelectItem>
            <SelectItem value="key2">🔑 Gemini Backup</SelectItem>
            <SelectItem value="groq">🔑 Groq Key</SelectItem>
            <SelectItem value="stt">🎤 Custom STT Primary</SelectItem>
            <SelectItem value="stt2">🎤 Custom STT Backup</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function AdminSettingsTab() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery();
  const { data: modelsData } = trpc.admin.getAvailableModels.useQuery();
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("تم عمل Override للإعدادات بنجاح. النظام يعمل بالقواعد الجديدة الآن!");
      refetch();
    },
    onError: () => toast.error("حدث خطأ أثناء حفظ الإعدادات"),
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
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-indigo-600" /> لوحة التحكم العبقرية (Smart Core)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            هنا يتم دمج المفاتيح، تحديد مسارات الذكاء الاصطناعي، ووضع قوانين النظام التي تُطبق كلياً وبشكل لحظي.
          </p>
        </div>
        <Button onClick={handleSubmit} disabled={updateSettings.isPending} size="lg" className="gap-2 shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white px-8">
          <Save className="w-5 h-5" />
          {updateSettings.isPending ? "جاري الحفظ والتطبيق..." : "حفظ وتنفيذ الإعدادات"}
        </Button>
      </div>

      <Tabs defaultValue="plans" className="w-full space-y-8">
        <TabsList className="p-1.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl flex-wrap h-auto gap-2 border shadow-inner w-full sm:w-fit">
          <TabsTrigger value="plans" className="gap-2 py-3 px-6 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-700 font-bold"><Database className="w-5 h-5"/> مركز إدارة الباقات</TabsTrigger>
          <TabsTrigger value="keys" className="gap-2 py-3 px-6 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-amber-600 font-bold"><Lock className="w-5 h-5"/> خزنة المفاتيح</TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2 py-3 px-6 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-rose-600 font-bold"><Terminal className="w-5 h-5"/> هندسة الأوامر</TabsTrigger>
          <TabsTrigger value="codes" className="gap-2 py-3 px-6 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-600 font-bold"><Calendar className="w-5 h-5"/> الخصومات والدعوات</TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit}>
          
          {/* ────────────────────────────────────────────────────────────
              1. PLANS CENTER (Merged Limits & AI Routing)
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="plans" className="space-y-6 animate-in fade-in-50">
            <Tabs defaultValue="free" className="w-full">
              <TabsList className="mb-6 p-1 bg-transparent border-b w-full justify-start rounded-none h-auto gap-4">
                <TabsTrigger value="free" className="text-lg pb-3 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none bg-transparent data-[state=active]:shadow-none data-[state=active]:bg-transparent">
                  الباقة المجانية (Free Plan)
                </TabsTrigger>
                <TabsTrigger value="pro" className="text-lg pb-3 data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none bg-transparent data-[state=active]:shadow-none data-[state=active]:bg-transparent">
                  الباقة المدفوعة (Pro / Ultra)
                </TabsTrigger>
              </TabsList>

              {["free", "pro"].map(plan => (
                <TabsContent key={plan} value={plan} className="space-y-8 animate-in slide-in-from-right-4">
                  {/* --- Routing Ranges --- */}
                  <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden border-t-4 border-t-indigo-500">
                    <div className="bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800 px-6 py-5">
                      <CardTitle className="text-xl flex items-center gap-2"><Route className="w-6 h-6 text-indigo-600" /> التوجيه الديناميكي للمصاريف (Parse Routing)</CardTitle>
                      <CardDescription className="mt-2 text-sm leading-relaxed">
                        هنا تصنع الذكاء! حدد ماذا يحدث عندما يرسل المستخدم فاتورة أو رسالة صوتية. يمكنك توجيه أول 10,000 توكن لخادم رخيص وسريع مثل Groq، ثم توجيه الباقي لـ Gemini، أو وضع حظر تلقائي لحماية ميزانيتك.
                      </CardDescription>
                    </div>
                    <CardContent className="p-6 bg-slate-50/30 dark:bg-slate-900/10">
                      <RoutingRangesEditor 
                        planName={plan} 
                        rawValue={formData[`${plan}_routing_ranges`] || ""} 
                        onChange={(v) => updateField(`${plan}_routing_ranges`, v)} 
                        models={models} 
                      />
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* --- Dedicated Models (Reports & Voice) --- */}
                    <Card className="border-slate-200 shadow-sm overflow-hidden flex-1">
                      <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                        <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="w-5 h-5 text-slate-600" /> محركات المعالجة المخصصة</CardTitle>
                      </div>
                      <CardContent className="p-6 space-y-8">
                        <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-500" /> محرك التحليلات والتقارير الشهرية
                          </h4>
                          <ReportPlanConfig plan={plan} formData={formData} updateField={updateField} models={models} />
                        </div>
                        <div className="space-y-4">
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-2 flex items-center gap-2">
                            <Mic className="w-4 h-4 text-rose-500" /> المحرك الصوتي (Voice STT Engine)
                          </h4>
                          <SttPlanConfig plan={plan} formData={formData} updateField={updateField} models={models} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* --- Hard Limits --- */}
                    <Card className="border-slate-200 shadow-sm overflow-hidden flex-1">
                      <div className="bg-slate-50 dark:bg-slate-900 border-b px-6 py-4">
                        <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-slate-600" /> القواعد الاستهلاكية والصلاحيات</CardTitle>
                      </div>
                      <CardContent className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">سقف التوكنز الشهري</Label>
                            <Input type="number" dir="ltr" className="font-mono" value={formData[`${plan}_token_limit`] || ""} onChange={(e) => updateField(`${plan}_token_limit`, e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">سقف دقائق الصوت (بالثواني)</Label>
                            <Input type="number" dir="ltr" className="font-mono" value={formData[`voice_limit_${plan}`] || ""} onChange={(e) => updateField(`voice_limit_${plan}`, e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">حجم التقرير (طول بالكلمات)</Label>
                            <Input type="number" dir="ltr" className="font-mono" value={formData[`report_words_${plan}`] || ""} onChange={(e) => updateField(`report_words_${plan}`, e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500">أيام بين التقرير والآخر</Label>
                            <Input type="number" dir="ltr" className="font-mono" value={formData[`report_limit_${plan}`] || ""} onChange={(e) => updateField(`report_limit_${plan}`, e.target.value)} />
                          </div>
                        </div>

                        <div className="pt-4 border-t space-y-4">
                          <Label className="font-bold text-sm text-slate-800">مفاتيح تفعيل الصلاحيات (Feature Flags)</Label>
                          <div className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border">
                            <div className="flex items-center justify-between">
                              <Label className="cursor-pointer">تفعيل الإدخال الذكي (AI Parse)</Label>
                              <Switch checked={formData[`${plan}_ai_parse`] !== "false"} onCheckedChange={(c) => updateField(`${plan}_ai_parse`, c ? "true" : "false")} />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="cursor-pointer">تفعيل التقارير الشهرية الذكية (AI Analysis)</Label>
                              <Switch checked={formData[`${plan}_ai_analysis`] !== "false"} onCheckedChange={(c) => updateField(`${plan}_ai_analysis`, c ? "true" : "false")} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              2. API KEYS VAULT
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="keys" className="space-y-6">
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-amber-500">
              <div className="bg-amber-50/30 dark:bg-amber-950/20 border-b px-6 py-5">
                <CardTitle className="text-xl flex items-center gap-2"><Key className="w-6 h-6 text-amber-600" /> خزنة المفاتيح المركزية (API Vault)</CardTitle>
                <CardDescription className="mt-2 text-sm">
                  قم بحفظ المفاتيح الخاصة بك هنا مرة واحدة. في مركز الباقات تستطيع اختيار المفتاح بالاسم (مثلاً: Gemini Key 1) وسيتم حقنه في الكود تلقائياً. هذه الطريقة تحمي المفاتيح وتسهل تغييرها دون تعديل كل باقة على حدة.
                </CardDescription>
              </div>
              <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-3 mb-2">
                    <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><span className="text-xl">🔑</span> Gemini Primary Key</Label>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">الأساسي</Badge>
                  </div>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key || ""} onChange={(e) => updateField("ai_api_key", e.target.value)} dir="ltr" className="font-mono h-12 text-lg tracking-wider" />
                  <p className="text-xs text-muted-foreground pt-1">المعرف: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">key1</code></p>
                </div>

                <div className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-3 mb-2">
                    <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><span className="text-xl">🔑</span> Gemini Backup Key</Label>
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">الاحتياطي</Badge>
                  </div>
                  <Input type="password" placeholder="AIzaSy..." value={formData.ai_api_key_2 || ""} onChange={(e) => updateField("ai_api_key_2", e.target.value)} dir="ltr" className="font-mono h-12 text-lg tracking-wider" />
                  <p className="text-xs text-muted-foreground pt-1">المعرف: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">key2</code></p>
                </div>

                <div className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-3 mb-2">
                    <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><span className="text-xl">🔑</span> Groq Ultra Fast Key</Label>
                    <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">للسرعة العالية</Badge>
                  </div>
                  <Input type="password" placeholder="gsk_..." value={formData.groq_api_key || ""} onChange={(e) => updateField("groq_api_key", e.target.value)} dir="ltr" className="font-mono h-12 text-lg tracking-wider" />
                  <p className="text-xs text-muted-foreground pt-1">المعرف: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">groq</code></p>
                </div>

                <div className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-3 mb-2">
                    <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><span className="text-xl">🎤</span> Custom STT Primary Key</Label>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">الأساسي للصوت</Badge>
                  </div>
                  <Input type="password" placeholder="AIzaSy..." value={formData.stt_api_key || ""} onChange={(e) => updateField("stt_api_key", e.target.value)} dir="ltr" className="font-mono h-12 text-lg tracking-wider" />
                  <p className="text-xs text-muted-foreground pt-1">المعرف: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">stt</code></p>
                </div>

                <div className="space-y-3 bg-white dark:bg-slate-950 p-5 rounded-2xl border dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-3 mb-2">
                    <Label className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><span className="text-xl">🎤</span> Custom STT Backup Key</Label>
                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">الاحتياطي للصوت</Badge>
                  </div>
                  <Input type="password" placeholder="AIzaSy..." value={formData.stt_api_key_2 || ""} onChange={(e) => updateField("stt_api_key_2", e.target.value)} dir="ltr" className="font-mono h-12 text-lg tracking-wider" />
                  <p className="text-xs text-muted-foreground pt-1">المعرف: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">stt2</code></p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              3. PROMPT ENGINEERING
             ──────────────────────────────────────────────────────────── */}
          <TabsContent value="prompts" className="space-y-8">
            <Card className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-rose-500">
              <div className="bg-rose-50/30 dark:bg-rose-950/20 border-b px-6 py-5">
                <CardTitle className="text-xl flex items-center gap-2"><Terminal className="w-6 h-6 text-rose-600" /> هندسة الأوامر المتقدمة (Prompt Engineering)</CardTitle>
                <CardDescription className="mt-2 text-sm text-slate-600 font-medium">أنت من يصنع شخصية التطبيق ويتحكم في جودة ودقة التحليلات. <br/><span className="text-rose-600 font-bold">ملاحظة هامة:</span> هذه الأوامر تنطبق حصرياً على <strong>"التقارير الشهرية الذكية (Monthly Reports)"</strong> ولا تؤثر على مصنف المصروفات المباشر (Expense Classification) لحماية استقرار البنية الهيكلية للبيانات.</CardDescription>
              </div>
              <CardContent className="p-6 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl border">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">نمط الإخراج الافتراضي</Label>
                    <Select value={formData.ai_response_length || "medium"} onValueChange={(v) => updateField("ai_response_length", v)}>
                      <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="اختر الإخراج" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">موجز تنفيذي سريع</SelectItem>
                        <SelectItem value="medium">متوازن (الافتراضي)</SelectItem>
                        <SelectItem value="detailed">تفصيلي أكاديمي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">بؤرة التركيز (Focus)</Label>
                    <Select value={formData.ai_focus || "balanced"} onValueChange={(v) => updateField("ai_focus", v)}>
                      <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue placeholder="اختر التركيز" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">نصائح وأرقام</SelectItem>
                        <SelectItem value="statistics">أرقام فقط (للمحاسبين)</SelectItem>
                        <SelectItem value="tips">نصائح حصرية</SelectItem>
                        <SelectItem value="patterns">استخراج الأنماط النفسية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-slate-500" /> الشخصية الأساسية (System Prompt)</Label>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900 border-2 focus:border-rose-500"
                      value={formData.ai_system_prompt || ""}
                      onChange={(e) => updateField("ai_system_prompt", e.target.value)}
                      dir="rtl"
                    />
                    <p className="text-xs text-muted-foreground">يعمل كمخ الـ AI الأساسي في التعامل مع جميع المدخلات.</p>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> توجيهات متقدمة (Advanced Guidelines)</Label>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900 border-2"
                      value={formData.ai_advanced_instructions || ""}
                      onChange={(e) => updateField("ai_advanced_instructions", e.target.value)}
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-bold flex items-center gap-2 text-rose-600"><Lock className="w-4 h-4" /> تجاوز الهيكل الإلزامي (Structure Override)</Label>
                    <Textarea 
                      className="font-mono text-sm min-h-[120px] bg-rose-50/50 dark:bg-rose-950/20 border-2 border-rose-200 dark:border-rose-900"
                      value={formData.ai_report_structure_override || ""}
                      onChange={(e) => updateField("ai_report_structure_override", e.target.value)}
                      dir="rtl"
                      placeholder="اتركه فارغاً للاعتماد على برمجة الـ Backend. الكتابة هنا تجبر الموديل على بناء التقرير كما تريد أنت حرفياً."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ────────────────────────────────────────────────────────────
              4. PROMO CODES (Legacy Tab Kept Exactly)
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
                     <Input type="number" dir="ltr" className="font-mono text-lg py-6 bg-slate-50 dark:bg-slate-900" value={formData.promo_code_discount || ""} onChange={(e) => updateField("promo_code_discount", e.target.value)} />
                     <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">%</span>
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
          <Plus className="w-4 h-4" /> إصدار كود جديد
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
