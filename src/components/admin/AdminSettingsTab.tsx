import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Save,
  BrainCircuit,
  Database,
  Lock,
  Calendar,
  Info,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPlansTab } from "./settings/AdminPlansTab";
import { AdminKeysTab } from "./settings/AdminKeysTab";
import { AdminCodesTab } from "./settings/AdminCodesTab";

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
            {backupMutation.isPending
              ? "جاري التجميع..."
              : "نسخة احتياطية (Backup)"}
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
          <TabsContent
            value="plans"
            className="space-y-6 animate-in fade-in-50"
          >
            <AdminPlansTab
              formData={formData}
              updateField={updateField}
              models={models}
            />
          </TabsContent>

          <TabsContent value="keys" className="space-y-6">
            <AdminKeysTab
              formData={formData}
              updateField={updateField}
              models={models}
            />
          </TabsContent>

          <TabsContent value="codes" className="space-y-8">
            <AdminCodesTab
              formData={formData}
              updateField={updateField}
            />
          </TabsContent>
        </form>
      </Tabs>
    </div>
  );
}
