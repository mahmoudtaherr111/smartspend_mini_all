import React, { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Server, Trash2, Cpu, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface DiscoveredModelItem {
  id: string;
  name?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

export function AiProviderManagerTab() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [protocol, setProtocol] = useState<"openai" | "gemini" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState("https://openrouter.ai/api/v1");
  const [apiKey, setApiKey] = useState("");

  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModelItem[]>([]);
  const [selectedModels, setSelectedModels] = useState<Record<string, {
    purposes: string[];
    allowedTiers: string[];
    isDefault: boolean;
    inputPrice: number;
    outputPrice: number;
    cachedPrice: number;
  }>>({});

  const providersQuery = trpc.admin.getAiProviders.useQuery();
  const modelsQuery = trpc.admin.getAiModels.useQuery();

  const addProviderMutation = trpc.admin.addAiProvider.useMutation({
    onSuccess: () => {
      providersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteProviderMutation = trpc.admin.deleteAiProvider.useMutation({
    onSuccess: () => {
      toast.success("تم حذف المزود وموديلاته");
      providersQuery.refetch();
      modelsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleProviderMutation = trpc.admin.updateAiProvider.useMutation({
    onSuccess: () => {
      providersQuery.refetch();
      toast.success("تم تحديث حالة المزود");
    },
    onError: (err) => toast.error(err.message),
  });

  const discoverMutation = trpc.admin.discoverProviderModels.useMutation({
    onSuccess: (data) => {
      const modelsList = (data.models || []) as DiscoveredModelItem[];
      setDiscoveredModels(modelsList);
      const initSelected: Record<string, any> = {};
      for (const m of modelsList) {
        initSelected[m.id] = {
          purposes: ["chat", "classification"],
          allowedTiers: ["free", "pro", "ultra"],
          isDefault: false,
          inputPrice: 0.14,
          outputPrice: 0.56,
          cachedPrice: 0.014,
        };
      }
      setSelectedModels(initSelected);
      toast.success(`تم استكشاف ${modelsList.length} موديل بنجاح!`);
    },
    onError: (err) => toast.error(`فشل الاتصال بالمزود: ${err.message}`),
  });

  const saveModelsMutation = trpc.admin.saveAiModels.useMutation({
    onSuccess: () => {
      modelsQuery.refetch();
      setDiscoveredModels([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveDiscovered = async (providerId: number) => {
    const modelPayload = discoveredModels.map((m) => {
      const config = selectedModels[m.id] || {
        purposes: ["chat"],
        allowedTiers: ["pro"],
        isDefault: false,
        inputPrice: 0.14,
        outputPrice: 0.56,
        cachedPrice: 0.014,
      };
      return {
        modelId: m.id,
        displayName: m.name || m.id,
        purposes: config.purposes,
        allowedTiers: config.allowedTiers,
        isDefaultForPurpose: config.isDefault,
        inputPricePer1M: config.inputPrice,
        outputPricePer1M: config.outputPrice,
        cachedPricePer1M: config.cachedPrice,
        supportsVision: Boolean(m.supportsVision),
        supportsReasoning: Boolean(m.supportsReasoning),
        isActive: true,
      };
    });

    if (modelPayload.length > 0) {
      await saveModelsMutation.mutateAsync({
        providerId,
        models: modelPayload,
      });
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !baseUrl || !apiKey) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    const finalSlug = slug || displayName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const res = await addProviderMutation.mutateAsync({
      slug: finalSlug,
      displayName,
      protocol,
      baseUrl,
      apiKey,
      priority: 10,
    });

    if (res?.id && discoveredModels.length > 0) {
      await handleSaveDiscovered(res.id);
      toast.success(`تمت إضافة المزود وحفظ ${discoveredModels.length} موديل بنجاح!`);
    } else {
      toast.success("تمت إضافة المزود بنجاح!");
    }

    setIsAddOpen(false);
  };

  const providers = providersQuery.data || [];
  const configuredModels = modelsQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-400" />
            إدارة المزودات والموديلات السحابية
          </h2>
          <p className="text-xs text-slate-400">
            أضف أي مزود عالمي (OpenRouter, DeepSeek, Groq) دون كتابة كود برمجياً واستكشف موديلاته فوراً
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
        >
          <Plus className="w-4 h-4 ml-1.5" />
          إضافة مزود جديد
        </Button>
      </div>

      {/* 1. Active Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.length === 0 ? (
          <Card className="col-span-full p-8 text-center bg-slate-900/40 border-slate-800">
            <Server className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">لم يتم تسجيل أي مزود ديناميكي حتى الآن.</p>
            <p className="text-xs text-slate-500 mt-1">يستخدم النظام حالياً الإعدادات الافتراضية من ملف البيئة.</p>
          </Card>
        ) : (
          providers.map((p) => {
            const providerModels = configuredModels.filter((m) => m.providerId === p.id);
            return (
              <Card key={p.id} className="bg-slate-900/70 border-slate-800 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <CardTitle className="text-base font-bold text-slate-100">{p.displayName}</CardTitle>
                    </div>
                    <Badge variant="outline" className="border-slate-700 bg-slate-950 font-mono text-[10px]">
                      {p.protocol}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-400 truncate font-mono">
                    {p.baseUrl}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <span>الموديلات النشطة:</span>
                    <span className="font-bold text-indigo-400 font-mono">{providerModels.length} موديل</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={(checked) => toggleProviderMutation.mutate({ id: p.id, isActive: checked })}
                      />
                      <span className="text-xs text-slate-300">{p.isActive ? "نشط" : "معطل"}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`هل أنت متأكد من حذف ${p.displayName} وجميع موديلاته؟`)) {
                          deleteProviderMutation.mutate({ id: p.id });
                        }
                      }}
                      className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8 px-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* 2. Configured Models Table */}
      <Card className="bg-slate-900/70 border-slate-800 shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-200">
            <Cpu className="w-4 h-4 text-indigo-400" />
            الموديلات المربوطة والموجهة (Configured AI Models)
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            توزيع الموديلات على الأغراض (شات، تصنيف) والباقات (مجاني، برو، ألترا)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-semibold">الموديل (Model ID)</th>
                  <th className="pb-3 font-semibold">الغرض (Purpose)</th>
                  <th className="pb-3 font-semibold">الباقات المسموحة</th>
                  <th className="pb-3 font-semibold">سعر الـ 1M إدخال</th>
                  <th className="pb-3 font-semibold">سعر الـ 1M إخراج</th>
                  <th className="pb-3 font-semibold">كاش 1M</th>
                  <th className="pb-3 font-semibold">افتراضي؟</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {configuredModels.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                      لا توجد موديلات مهيأة بعد. استخدم زر "إضافة مزود" لاستكشاف الموديلات وحفظها.
                    </td>
                  </tr>
                ) : (
                  configuredModels.map((m) => {
                    const purposes = Array.isArray(m.purposes) ? (m.purposes as string[]) : [];
                    const tiers = Array.isArray(m.allowedTiers) ? (m.allowedTiers as string[]) : [];
                    return (
                      <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 font-bold text-slate-200">
                          {m.displayName}
                          <span className="block text-[10px] text-slate-500 font-normal">{m.modelId}</span>
                        </td>
                        <td className="py-3 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {purposes.map((p) => (
                              <Badge key={p} variant="outline" className="text-[10px] border-slate-700 bg-slate-950">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {tiers.map((t) => (
                              <Badge key={t} className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-slate-300">${Number(m.inputPricePer1M).toFixed(4)}</td>
                        <td className="py-3 text-slate-300">${Number(m.outputPricePer1M).toFixed(4)}</td>
                        <td className="py-3 text-emerald-400">${Number(m.cachedPricePer1M).toFixed(4)}</td>
                        <td className="py-3">
                          {m.isDefaultForPurpose ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                              نعم (Primary)
                            </Badge>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Provider & Model Discovery Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-950 text-slate-100 border-slate-800 p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              إضافة مزود AI جديد واستكشاف الموديلات
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              أدخل بيانات الاتصال ثم اضغط فحص لجلب قائمة الموديلات المتاحة تلقائياً
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">اسم المزود (Display Name)</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثال: OpenRouter, DeepSeek Direct"
                  className="bg-slate-900 border-slate-800 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">البروتوكول (Protocol)</Label>
                <Select value={protocol} onValueChange={(val: any) => setProtocol(val)}>
                  <SelectTrigger className="bg-slate-900 border-slate-800 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-xs">
                    <SelectItem value="openai">OpenAI Compatible (OpenRouter, DeepSeek, Groq, Fireworks)</SelectItem>
                    <SelectItem value="gemini">Google Gemini Native SDK</SelectItem>
                    <SelectItem value="anthropic">Anthropic Messages API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">رابط الـ API الأساسي (Base URL)</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                className="bg-slate-900 border-slate-800 text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">مفتاح الـ API (API Key)</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="bg-slate-900 border-slate-800 text-xs font-mono"
                required
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => discoverMutation.mutate({ baseUrl, apiKey, protocol })}
                disabled={discoverMutation.isPending || !baseUrl || !apiKey}
                className="border-indigo-600/40 text-indigo-300 hover:bg-indigo-600/10 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${discoverMutation.isPending ? "animate-spin" : ""}`} />
                {discoverMutation.isPending ? "جاري الفحص..." : "🔍 فحص واستكشاف الموديلات"}
              </Button>

              <Button type="submit" disabled={addProviderMutation.isPending} className="bg-indigo-600 hover:bg-indigo-500 text-xs font-bold">
                حفظ المزود في النظام
              </Button>
            </div>
          </form>

          {/* Discovered Models List */}
          {discoveredModels.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  تم اكتشاف {discoveredModels.length} موديل متاح
                </span>
                <span className="text-[10px] text-slate-500">اختر ووجه الموديلات</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
                {discoveredModels.slice(0, 10).map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    <span className="font-bold truncate max-w-[280px]">{m.id}</span>
                    <Badge variant="outline" className="text-[10px] border-slate-700">
                      {m.contextWindow ? `${Math.round(m.contextWindow / 1000)}k ctx` : "128k"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
