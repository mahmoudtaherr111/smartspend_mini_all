import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, Eye, MousePointerClick, Calendar, Check, X, AlertTriangle } from "lucide-react";

export function AdminAdsTab() {
  const utils = trpc.useUtils();
  const { data: adsData, isLoading, refetch } = trpc.ads.stats.useQuery();

  const createMutation = trpc.ads.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الإعلان بنجاح! 🚀");
      refetch();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(`حدث خطأ أثناء الإنشاء: ${err.message}`);
    },
  });

  const updateMutation = trpc.ads.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث حالة الإعلان ✅");
      refetch();
    },
    onError: (err) => {
      toast.error(`حدث خطأ أثناء التحديث: ${err.message}`);
    },
  });

  const deleteMutation = trpc.ads.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الإعلان بنجاح");
      refetch();
      setAdToDelete(null);
    },
    onError: (err) => {
      toast.error(`حدث خطأ أثناء الحذف: ${err.message}`);
    },
  });

  // Modal / form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [adToDelete, setAdToDelete] = useState<any | null>(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<"sidebar" | "banner" | "popup">("sidebar");
  const [targetPlan, setTargetPlan] = useState<"free" | "all">("free");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resetForm = () => {
    setTitle("");
    setContent("");
    setImageUrl("");
    setLinkUrl("");
    setPlacement("sidebar");
    setTargetPlan("free");
    setStartDate("");
    setEndDate("");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("يرجى ملء الحقول الأساسية (العنوان والمحتوى)");
      return;
    }
    createMutation.mutate({
      title,
      content,
      imageUrl: imageUrl.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
      placement,
      targetPlan,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل الإعلانات...</div>;
  }

  const adsList = adsData?.ads || [];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-slate-500">إجمالي النقرات</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">
                  {String(adsData?.totalClicks ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-pink-50 dark:bg-pink-900/30 rounded-xl text-pink-600">
                <MousePointerClick className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-slate-500">إجمالي المشاهدات</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">
                  {String(adsData?.totalImpressions ?? 0)}
                </p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600">
                <Eye className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-bold text-slate-500">معدل التحويل المتوسط (CTR)</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">
                  {adsData?.totalImpressions
                    ? `${((Number(adsData.totalClicks) / Number(adsData.totalImpressions)) * 100).toFixed(2)}%`
                    : "0%"}
                </p>
              </div>
              <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600">
                <Megaphone className="w-5 h-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Campaign List Card */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 text-pink-700 dark:text-pink-400">
              <Megaphone className="w-5 h-5" />
              حملات العروض والإعلانات الترويجية
            </CardTitle>
            <CardDescription dir="rtl">
              أضف بانرات ترويجية أو إعلانات تظهر للمستخدمين داخل التطبيق في القائمة الجانبية أو كإشعارات منبثقة.
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="rounded-xl bg-pink-600 hover:bg-pink-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" /> إنشاء إعلان جديد
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-end">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <tr>
                  <th className="p-4 font-medium">العنوان</th>
                  <th className="p-4 font-medium">الظهور</th>
                  <th className="p-4 font-medium">الباقة المستهدفة</th>
                  <th className="p-4 font-medium">المشاهدات</th>
                  <th className="p-4 font-medium">النقرات</th>
                  <th className="p-4 font-medium">معدل التحويل (CTR)</th>
                  <th className="p-4 font-medium">نشط</th>
                  <th className="p-4 font-medium text-start">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {adsList.map((ad: any) => (
                  <tr key={ad.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-4">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{ad.title}</span>
                        <span className="text-xs text-slate-500 block truncate max-w-xs">{ad.content}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary" className="capitalize">
                        {ad.placement}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="capitalize">
                        {ad.targetPlan}
                      </Badge>
                    </td>
                    <td className="p-4 font-mono">{ad.impressions || 0}</td>
                    <td className="p-4 font-mono">{ad.clicks || 0}</td>
                    <td className="p-4 font-mono">
                      {ad.impressions
                        ? `${((ad.clicks / ad.impressions) * 100).toFixed(1)}%`
                        : "0.0%"}
                    </td>
                    <td className="p-4">
                      <Switch
                        checked={!!ad.isActive}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ id: ad.id, isActive: checked })
                        }
                      />
                    </td>
                    <td className="p-4 text-start">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAdToDelete(ad)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {adsList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      لا توجد حملات إعلانية مسجلة حالياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* CREATE NEW AD DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
        <DialogContent className="max-w-md p-6 rounded-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <Megaphone className="w-5 h-5 text-pink-600" />
              إنشاء إعلان ترويجي جديد
            </DialogTitle>
            <DialogDescription>
              أدخل تفاصيل الحملة الترويجية التي تود عرضها للمستخدمين
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>العنوان الرئيسي للإعلان</Label>
              <Input
                placeholder="مثال: خصم 50% على باقة البرو! ⭐"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>نص محتوى الإعلان (المتن)</Label>
              <Textarea
                placeholder="اكتب تفاصيل العرض هنا..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label>رابط صورة الإعلان (اختياري)</Label>
              <Input
                placeholder="https://example.com/banner.png"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>رابط التوجيه عند الضغط (اختياري)</Label>
              <Input
                placeholder="https://smartspend.app/pro"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>مكان الظهور</Label>
                <Select value={placement} onValueChange={(val: any) => setPlacement(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sidebar">القائمة الجانبية (Sidebar)</SelectItem>
                    <SelectItem value="banner">بانر رئيسي (Banner)</SelectItem>
                    <SelectItem value="popup">نافذة منبثقة (Popup)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>الباقة المستهدفة</Label>
                <Select value={targetPlan} onValueChange={(val: any) => setTargetPlan(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">المستخدمين المجانيين فقط</SelectItem>
                    <SelectItem value="all">جميع خطط الاشتراكات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>تاريخ البدء (اختياري)</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>تاريخ الانتهاء (اختياري)</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <DialogFooter className="pt-4 flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-xl bg-pink-600 hover:bg-pink-700 text-white"
              >
                {createMutation.isPending ? "جاري الإنشاء..." : "حفظ وتفعيل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PREMIUM GLASSMORPHIC DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!adToDelete} onOpenChange={(open) => !open && setAdToDelete(null)}>
        <DialogContent className="max-w-sm p-6 rounded-3xl" dir="rtl">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-full">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                حذف الحملة الإعلانية؟
              </h3>
              <p className="text-sm text-slate-500">
                هل أنت متأكد من رغبتك في حذف إعلان <span className="font-semibold text-rose-600">"{adToDelete?.title}"</span>؟
                هذا الإجراء نهائي ولا يمكن التراجع عنه.
              </p>
            </div>
            <div className="flex gap-3 w-full pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setAdToDelete(null)}
              >
                إلغاء
              </Button>
              <Button
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
                disabled={deleteMutation.isPending}
                onClick={() => adToDelete && deleteMutation.mutate({ id: adToDelete.id })}
              >
                {deleteMutation.isPending ? "جاري الحذف..." : "نعم، حذف"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
