import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Send, Clock, ListChecks, History, CheckCircle, XCircle, Smartphone, Globe, Apple, Monitor } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { cn } from "../../lib/utils";

export function NotificationsTab() {
  // New Broadcast State
  const [broadcastTitleAr, setBroadcastTitleAr] = useState("");
  const [broadcastBodyAr, setBroadcastBodyAr] = useState("");
  const [broadcastTitleEn, setBroadcastTitleEn] = useState("");
  const [broadcastBodyEn, setBroadcastBodyEn] = useState("");
  const [formLanguage, setFormLanguage] = useState<"ar" | "en">("ar");
  const [previewLanguage, setPreviewLanguage] = useState<"ar" | "en">("ar");

  // Edit Template Dialog State
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editTitleAr, setEditTitleAr] = useState("");
  const [editBodyAr, setEditBodyAr] = useState("");
  const [editTitleEn, setEditTitleEn] = useState("");
  const [editBodyEn, setEditBodyEn] = useState("");
  const [editStreak, setEditStreak] = useState("");
  const [editInactivityDays, setEditInactivityDays] = useState("");
  const [editLanguage, setEditLanguage] = useState<"ar" | "en">("ar");

  const [targetPlan, setTargetPlan] = useState<string>("all");
  const [targetUsage, setTargetUsage] = useState<string>("0");
  const [targetDevice, setTargetDevice] = useState<string>("all");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [previewOS, setPreviewOS] = useState<"ios" | "android">("ios");
  const [userSearchText, setUserSearchText] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: templates, isLoading: templatesLoading } = trpc.admin.getNotificationTemplates.useQuery();
  const { data: logs, isLoading: logsLoading } = trpc.admin.getNotificationLogs.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.admin.getNotificationStats.useQuery();
  const { data: searchUserData, isLoading: searchUserLoading } = trpc.admin.listAllUsers.useQuery(
    { search: userSearchText, limit: 10 },
    { enabled: targetPlan === "specific" && userSearchText.length > 1 }
  );

  // Mutations
  const createTemplate = trpc.admin.createNotificationTemplate.useMutation({
    onSuccess: () => {
      toast.success("تم الحفظ والجدولة بنجاح!");
      setBroadcastTitleAr("");
      setBroadcastBodyAr("");
      setBroadcastTitleEn("");
      setBroadcastBodyEn("");
      setSelectedUser(null);
      setUserSearchText("");
      utils.admin.getNotificationTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(`حدث خطأ: ${err.message}`);
    }
  });

  const deleteTemplate = trpc.admin.deleteNotificationTemplate.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "تم حذف الحملة بنجاح!");
      utils.admin.getNotificationTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(`فشل الحذف: ${err.message}`);
    }
  });

  const toggleTemplate = trpc.admin.toggleNotificationTemplate.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث حالة الإشعار التلقائي");
      utils.admin.getNotificationTemplates.invalidate();
    }
  });

  const updateTemplate = trpc.admin.updateNotificationTemplate.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث قالب الإشعار بنجاح!");
      setEditingTemplate(null);
      utils.admin.getNotificationTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(`فشل التحديث: ${err.message}`);
    }
  });

  const triggerActivityCheck = trpc.admin.triggerActivityCheck.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "تم تشغيل فحص نشاط المستخدمين بنجاح!");
      utils.admin.getNotificationLogs.invalidate();
    },
    onError: (err) => {
      toast.error(`حدث خطأ أثناء فحص النشاط: ${err.message}`);
    }
  });

  const handleOpenEditModal = (t: any) => {
    setEditingTemplate(t);
    setEditName(t.name || "");
    setEditTitleAr(t.titleTemplateAr || t.titleTemplate || "");
    setEditBodyAr(t.bodyTemplateAr || t.bodyTemplate || "");
    setEditTitleEn(t.titleTemplateEn || "");
    setEditBodyEn(t.bodyTemplateEn || "");
    
    let streakVal = "";
    let inactivityDaysVal = "";
    try {
      if (t.targetSegment) {
        const seg = typeof t.targetSegment === "string" ? JSON.parse(t.targetSegment) : t.targetSegment;
        if (seg.minStreak !== undefined) streakVal = String(seg.minStreak);
        if (seg.inactivityDays !== undefined) inactivityDaysVal = String(seg.inactivityDays);
      }
    } catch(e) {}
    
    setEditStreak(streakVal);
    setEditInactivityDays(inactivityDaysVal);
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editTitleAr.trim() || !editBodyAr.trim()) {
      toast.error("يرجى ملء الحقول الإلزامية بالعربية");
      return;
    }

    const targetSegment: any = {};
    if (editingTemplate.eventType === "inactivity_reminder" || editingTemplate.eventType === "pro_conversion_streak") {
      targetSegment.minStreak = parseInt(editStreak, 10) || (editingTemplate.eventType === "inactivity_reminder" ? 2 : 4);
    } else if (editingTemplate.eventType === "dormant_reactivation") {
      targetSegment.inactivityDays = parseInt(editInactivityDays, 10) || 7;
    }

    updateTemplate.mutate({
      id: editingTemplate.id,
      name: editName,
      titleTemplateAr: editTitleAr,
      bodyTemplateAr: editBodyAr,
      titleTemplateEn: editTitleEn,
      bodyTemplateEn: editBodyEn,
      targetSegment
    });
  };

  const handleSendBroadcast = () => {
    if (!broadcastTitleAr.trim() && !broadcastTitleEn.trim()) {
      toast.error("يرجى إدخال عنوان إشعار بالعربية أو الإنجليزية على الأقل");
      return;
    }
    if (!broadcastBodyAr.trim() && !broadcastBodyEn.trim()) {
      toast.error("يرجى إدخال محتوى إشعار بالعربية أو الإنجليزية على الأقل");
      return;
    }

    const targetSegment: any = { 
      plan: targetPlan, 
      minUsage: parseInt(targetUsage, 10) || 0, 
      device: targetDevice 
    };

    if (targetPlan === "specific") {
      if (!selectedUser) {
        toast.error("يرجى اختيار المستخدم المستهدف أولاً");
        return;
      }
      targetSegment.userId = selectedUser.id;
      targetSegment.userType = selectedUser.userType;
      targetSegment.minUsage = 0;
    }

    createTemplate.mutate({
      name: `إرسال يدوي: ${(broadcastTitleAr || broadcastTitleEn).substring(0, 15)}`,
      eventType: "manual_scheduled",
      titleTemplate: broadcastTitleAr || broadcastTitleEn,
      bodyTemplate: broadcastBodyAr || broadcastBodyEn,
      titleTemplateAr: broadcastTitleAr,
      bodyTemplateAr: broadcastBodyAr,
      titleTemplateEn: broadcastTitleEn,
      bodyTemplateEn: broadcastBodyEn,
      targetSegment,
      sendAt: isScheduled && scheduleDate ? new Date(scheduleDate).toISOString() : new Date().toISOString()
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── Device Subscription Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي المشتركين</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">
                {statsLoading ? "..." : stats?.total ?? 0}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Smartphone className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">أجهزة الـ iOS</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">
                {statsLoading ? "..." : stats?.ios ?? 0}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
              <Apple className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">أجهزة الأندرويد</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">
                {statsLoading ? "..." : stats?.android ?? 0}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <Smartphone className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">أجهزة الويب</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-800 dark:text-slate-100">
                {statsLoading ? "..." : stats?.web ?? 0}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Globe className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="broadcast" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl">
          <TabsTrigger value="broadcast" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <Send className="w-4 h-4 me-2" /> إرسال مباشر ومجدول
          </TabsTrigger>
          <TabsTrigger value="triggers" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <ListChecks className="w-4 h-4 me-2" /> الإشعارات التلقائية
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <History className="w-4 h-4 me-2" /> سجل الإرسال
          </TabsTrigger>
        </TabsList>

        <TabsContent value="broadcast">
          <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
            <div className="bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-900/20 dark:to-indigo-900/20 border-b border-white/20 dark:border-slate-800 p-6">
              <CardTitle className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
                <Bell className="w-5 h-5" />
                محرك الاستهداف والإرسال الذكي (FCM Broker)
              </CardTitle>
              <CardDescription className="text-sky-600/70 dark:text-sky-300/70">
                استهدف فئات محددة من المستخدمين وأنواع الأجهزة وأرسل لهم إشعارات فورية أو مجدولة.
              </CardDescription>
            </div>
            
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* ─── Form Column ─── */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>الشريحة المستهدفة</Label>
                      <Select value={targetPlan} onValueChange={setTargetPlan}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الشريحة..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">الجميع</SelectItem>
                          <SelectItem value="free">المجاني فقط</SelectItem>
                          <SelectItem value="pro">برو فقط</SelectItem>
                          <SelectItem value="ultra">ألترا فقط</SelectItem>
                          <SelectItem value="specific">مستهدف محدد</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>الجهاز المستهدف</Label>
                      <Select value={targetDevice} onValueChange={setTargetDevice}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر نوع الجهاز..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل الأجهزة</SelectItem>
                          <SelectItem value="ios">آيفون (iOS) فقط</SelectItem>
                          <SelectItem value="android">أندرويد (Android) فقط</SelectItem>
                          <SelectItem value="web">متصفح ويب (Web) فقط</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>شرط الاستخدام (أقل عدد مصروفات مضافة)</Label>
                    <Input
                      type="number"
                      placeholder="0 لعدم وجود شرط"
                      value={targetUsage}
                      onChange={(e) => setTargetUsage(e.target.value)}
                    />
                  </div>

                  {targetPlan === "specific" && (
                    <div className="grid gap-2 border border-dashed border-indigo-200 dark:border-indigo-900/50 p-4 rounded-2xl bg-indigo-50/20 dark:bg-indigo-950/10 space-y-2 animate-in fade-in duration-200 text-right" dir="rtl">
                      <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-400">البحث عن مستخدم واستهدافه</Label>
                      <Input
                        placeholder="ابحث بالاسم، الهاتف، أو البريد الإلكتروني..."
                        value={userSearchText}
                        onChange={(e) => setUserSearchText(e.target.value)}
                        className="text-right font-sans"
                        dir="rtl"
                      />
                      
                      {selectedUser ? (
                        <div className="flex items-center justify-between bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-semibold">
                          <span>المستهدف: {selectedUser.name} ({selectedUser.userType === "local" ? "محلي" : "OAuth"}) - ID: {selectedUser.id}</span>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            className="text-white hover:text-red-200 h-5 w-5 p-0 text-base"
                            onClick={() => setSelectedUser(null)}
                          >
                            ×
                          </Button>
                        </div>
                      ) : (
                        userSearchText.length > 1 && (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 shadow-md">
                            {searchUserLoading && <div className="p-3 text-center text-xs text-slate-400">جاري البحث...</div>}
                            {searchUserData?.users?.map((u: any) => (
                              <div
                                key={`${u.userType}:${u.id}`}
                                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs flex justify-between items-center"
                                onClick={() => {
                                  setSelectedUser(u);
                                  setUserSearchText("");
                                }}
                              >
                                <div className="text-right">
                                  <div className="font-bold text-slate-800 dark:text-slate-200">{u.name}</div>
                                  <div className="text-[10px] text-slate-400">{u.phone || u.email || "بدون جهة اتصال"}</div>
                                </div>
                                <Badge variant="outline">{u.userType === "local" ? "محلي" : "OAuth"}</Badge>
                              </div>
                            ))}
                            {searchUserData?.users?.length === 0 && !searchUserLoading && (
                              <div className="p-3 text-center text-xs text-slate-400">لا توجد نتائج تطابق بحثك.</div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 pt-2">
                    <input 
                      type="checkbox" 
                      id="isScheduled" 
                      checked={isScheduled} 
                      onChange={e => setIsScheduled(e.target.checked)} 
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <Label htmlFor="isScheduled" className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                      جدولة للمستقبل (Schedule)
                    </Label>
                  </div>
                  
                  {isScheduled && (
                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-4">
                      <Label>تاريخ ووقت الإرسال</Label>
                      <Input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                    </div>
                  )}

                  <hr className="border-slate-100 dark:border-slate-800" />

                  {/* Form Language Selector */}
                  <div className="flex justify-between items-center border-b pb-2 pt-2">
                    <Label className="font-bold">لغة كتابة الإشعار</Label>
                    <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex gap-0.5">
                      <button
                        type="button"
                        className={cn("px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all", formLanguage === "ar" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "opacity-60 text-slate-500")}
                        onClick={() => setFormLanguage("ar")}
                      >
                        العربية
                      </button>
                      <button
                        type="button"
                        className={cn("px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all", formLanguage === "en" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "opacity-60 text-slate-500")}
                        onClick={() => setFormLanguage("en")}
                      >
                        English
                      </button>
                    </div>
                  </div>

                  {formLanguage === "ar" ? (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="grid gap-2">
                        <Label className="text-xs">عنوان الإشعار (بالعربية)</Label>
                        <Input
                          placeholder="مثال: خصم خاص لك 🚀"
                          value={broadcastTitleAr}
                          onChange={(e) => setBroadcastTitleAr(e.target.value)}
                          dir="rtl"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">محتوى الإشعار (بالعربية)</Label>
                        <Textarea
                          placeholder="اكتب رسالتك هنا..."
                          value={broadcastBodyAr}
                          onChange={(e) => setBroadcastBodyAr(e.target.value)}
                          rows={4}
                          className="resize-none"
                          dir="rtl"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="grid gap-2">
                        <Label className="text-xs">Notification Title (English)</Label>
                        <Input
                          placeholder="e.g. Special offer for you! 🚀"
                          value={broadcastTitleEn}
                          onChange={(e) => setBroadcastTitleEn(e.target.value)}
                          dir="ltr"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Notification Content (English)</Label>
                        <Textarea
                          placeholder="Write your notification message here..."
                          value={broadcastBodyEn}
                          onChange={(e) => setBroadcastBodyEn(e.target.value)}
                          rows={4}
                          className="resize-none"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  )}
                  
                  <Button
                    onClick={handleSendBroadcast}
                    disabled={createTemplate.isPending}
                    className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-6 text-base rounded-xl mt-4"
                  >
                    {isScheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {createTemplate.isPending ? "جاري الحفظ والجدولة..." : (isScheduled ? "حفظ وجدولة الحملة" : "إرسال الحملة الآن")}
                  </Button>
                </div>

                {/* ─── Preview Column ─── */}
                <div className="lg:col-span-2 flex flex-col justify-start">
                  <div className="flex justify-between items-center mb-4">
                    <Label className="text-sm font-semibold">المعاينة الحية على الموبايل</Label>
                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex gap-1">
                      <Button 
                        variant={previewLanguage === "ar" ? "secondary" : "ghost"} 
                        size="sm" 
                        className="h-7 px-2 text-[10px] font-bold" 
                        onClick={() => setPreviewLanguage("ar")}
                      >
                        عربي
                      </Button>
                      <Button 
                        variant={previewLanguage === "en" ? "secondary" : "ghost"} 
                        size="sm" 
                        className="h-7 px-2 text-[10px] font-bold" 
                        onClick={() => setPreviewLanguage("en")}
                      >
                        En
                      </Button>
                      <span className="text-slate-300 dark:text-slate-700 self-center">|</span>
                      <Button 
                        variant={previewOS === "ios" ? "secondary" : "ghost"} 
                        size="sm" 
                        className="h-7 px-2 text-[10px] font-bold" 
                        onClick={() => setPreviewOS("ios")}
                      >
                        iOS
                      </Button>
                      <Button 
                        variant={previewOS === "android" ? "secondary" : "ghost"} 
                        size="sm" 
                        className="h-7 px-2 text-[10px] font-bold" 
                        onClick={() => setPreviewOS("android")}
                      >
                        Android
                      </Button>
                    </div>
                  </div>

                  {/* Mobile Preview Area */}
                  <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 bg-slate-950 min-h-[360px] flex items-center justify-center relative overflow-hidden">
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-900 rounded-full z-10"></div>
                    
                    {/* iOS Mockup */}
                    {previewOS === "ios" ? (
                      <div className="w-full max-w-[260px] bg-white/20 dark:bg-black/40 backdrop-blur-xl border border-white/20 rounded-2xl p-3 text-white text-end font-sans shadow-lg animate-in zoom-in-95" dir={previewLanguage === "ar" ? "rtl" : "ltr"}>
                        <div className="flex items-center justify-between mb-1.5 text-[10px] opacity-60">
                          {previewLanguage === "ar" ? (
                            <>
                              <div className="flex items-center gap-1">
                                <img src="/photos/white_mode_logo-removebg-preview.png" className="w-4 h-4 rounded-md object-contain bg-slate-900/10 dark:bg-white/10" alt="Logo" />
                                <span className="font-semibold">SmartSpend</span>
                              </div>
                              <span>الآن</span>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-1">
                                <img src="/photos/white_mode_logo-removebg-preview.png" className="w-4 h-4 rounded-md object-contain bg-slate-900/10 dark:bg-white/10" alt="Logo" />
                                <span className="font-semibold">SmartSpend</span>
                              </div>
                              <span>now</span>
                            </>
                          )}
                        </div>
                        <h4 className="text-xs font-bold leading-tight">
                          {previewLanguage === "ar" 
                            ? (broadcastTitleAr.trim() || "عنوان الإشعار يظهر هنا...") 
                            : (broadcastTitleEn.trim() || "Notification title here...")}
                        </h4>
                        <p className="text-[11px] mt-1 leading-normal opacity-90 text-slate-100 break-words">
                          {previewLanguage === "ar" 
                            ? (broadcastBodyAr.trim() || "محتوى ونص الإشعار التنبيهي سيظهر في هذا المكان بتفاصيله...") 
                            : (broadcastBodyEn.trim() || "Notification content text will appear here in detail...")}
                        </p>
                      </div>
                    ) : (
                      /* Android Mockup */
                      <div className="w-full max-w-[260px] bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-white text-end font-sans shadow-lg animate-in zoom-in-95" dir={previewLanguage === "ar" ? "rtl" : "ltr"}>
                        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-slate-400">
                          <img src="/photos/white_mode_logo-removebg-preview.png" className="w-4 h-4 rounded-md object-contain bg-white/10" alt="Logo" />
                          <span className="font-semibold">SmartSpend</span>
                          <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                          <span>{previewLanguage === "ar" ? "الآن" : "now"}</span>
                        </div>
                        <h4 className="text-xs font-bold leading-tight">
                          {previewLanguage === "ar" 
                            ? (broadcastTitleAr.trim() || "عنوان الإشعار يظهر هنا...") 
                            : (broadcastTitleEn.trim() || "Notification title here...")}
                        </h4>
                        <p className="text-[11px] mt-1 leading-normal text-slate-300 break-words">
                          {previewLanguage === "ar" 
                            ? (broadcastBodyAr.trim() || "محتوى ونص الإشعار التنبيهي سيظهر في هذا المكان بتفاصيله...") 
                            : (broadcastBodyEn.trim() || "Notification content text will appear here in detail...")}
                        </p>
                        <div className="flex gap-2 justify-end mt-2 text-[9px] text-indigo-400 font-semibold border-t border-slate-800/80 pt-2">
                          <span className="cursor-pointer hover:underline">{previewLanguage === "ar" ? "عرض التفاصيل" : "View details"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm mt-6">
            <CardHeader className="text-right">
              <CardTitle className="text-lg flex items-center gap-2 text-indigo-700 dark:text-indigo-400 justify-end">
                الحملات اليدوية والمجدولة السابقة والمستقبلية
                <Clock className="w-5 h-5" />
              </CardTitle>
              <CardDescription className="text-right">
                الحملات اليدوية التي أرسلتها أو جدولتها للإرسال التلقائي المستقبلي.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="text-center p-8">جاري التحميل...</div>
              ) : (
                <div className="space-y-4">
                  {templates?.filter(t => t.eventType === 'manual_scheduled').map(t => {
                    let segment: any = {};
                    try {
                      segment = typeof t.targetSegment === "string" ? JSON.parse(t.targetSegment) : t.targetSegment;
                    } catch (e) {}

                    const isFuture = t.sendAt && new Date(t.sendAt) > new Date();
                    const isPending = t.isActive && isFuture;

                    let targetDesc = "الجميع";
                    if (segment.userId) {
                      targetDesc = `مستخدم محدد (معرف: ${segment.userId}, نوع: ${segment.userType === 'local' ? 'محلي' : 'OAuth'})`;
                    } else if (segment.plan && segment.plan !== "all") {
                      targetDesc = `شريحة: ${segment.plan === 'free' ? 'المجاني' : segment.plan === 'pro' ? 'برو' : segment.plan === 'ultra' ? 'ألترا' : segment.plan}`;
                    }

                    if (segment.device && segment.device !== "all") {
                      targetDesc += ` | أجهزة: ${segment.device === 'ios' ? 'آيفون' : segment.device === 'android' ? 'أندرويد' : 'ويب'}`;
                    }
                    if (segment.minUsage && segment.minUsage > 0) {
                      targetDesc += ` | استخدام: +${segment.minUsage}`;
                    }

                    return (
                      <div key={t.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-2xl bg-white dark:bg-slate-950 dark:border-slate-800 text-right" dir="rtl">
                        <div className="space-y-1">
                          <div className="font-semibold flex items-center gap-2 justify-end">
                            <Badge variant={isPending ? "default" : "secondary"}>
                              {isPending ? "معلقة/مجدولة" : !t.isActive ? "تم إرسالها / معطلة" : "قيد الإرسال"}
                            </Badge>
                            {t.name}
                          </div>
                          <div className="text-sm text-slate-500">
                            المستهدف: <span className="font-semibold">{targetDesc}</span>
                          </div>
                          <div className="text-sm text-slate-500">
                            وقت الإرسال: <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{t.sendAt ? format(new Date(t.sendAt), "yyyy-MM-dd HH:mm") : "-"}</span>
                          </div>
                          <div className="text-sm mt-2"><span className="text-slate-400">العنوان:</span> {t.titleTemplateAr || t.titleTemplate || "-"}</div>
                          <div className="text-sm"><span className="text-slate-400">المحتوى:</span> {t.bodyTemplateAr || t.bodyTemplate || "-"}</div>
                        </div>
                        <div className="mt-4 sm:mt-0 self-center">
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="rounded-xl"
                            onClick={() => {
                              if (confirm("هل أنت متأكد من حذف وإلغاء هذه الحملة المجدولة؟")) {
                                deleteTemplate.mutate({ id: t.id });
                              }
                            }}
                            disabled={deleteTemplate.isPending}
                          >
                            حذف وإلغاء
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {templates?.filter(t => t.eventType === 'manual_scheduled').length === 0 && (
                    <div className="text-center p-8 text-slate-500">لا توجد حملات يدوية أو مجدولة مسجلة.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="triggers">
           <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                  <Bell className="w-5 h-5" /> الإشعارات التلقائية المبرمجة
                </CardTitle>
                <CardDescription>تحكم في التنبيهات التي يعملها النظام تلقائياً للرد على سلوك المستخدمين.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => triggerActivityCheck.mutate()}
                disabled={triggerActivityCheck.isPending}
                className="rounded-xl border-indigo-200 hover:bg-indigo-50 dark:border-indigo-900/50 dark:hover:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold"
              >
                {triggerActivityCheck.isPending ? "جاري فحص النشاط..." : "تشغيل فحص النشاط الفوري"}
              </Button>
            </CardHeader>
            <CardContent>
               {templatesLoading ? <div className="text-center p-8">جاري التحميل...</div> : (
                 <div className="grid gap-4">
                   {templates?.filter(t => t.eventType !== 'manual_scheduled').map(t => (
                     <div key={t.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-2xl bg-white dark:bg-slate-950 dark:border-slate-800">
                       <div className="space-y-1">
                         <div className="font-semibold flex items-center gap-2">
                           {t.name}
                           <Badge variant={t.isActive ? "default" : "secondary"}>
                             {t.isActive ? "مفعل" : "معطل"}
                           </Badge>
                         </div>
                         <div className="text-sm text-slate-500">حدث: <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">{t.eventType}</span></div>
                         <div className="text-sm mt-2"><span className="text-slate-400">العنوان (عربي):</span> {t.titleTemplateAr || t.titleTemplate}</div>
                         {t.titleTemplateEn && <div className="text-sm"><span className="text-slate-400">العنوان (إنجليزي):</span> {t.titleTemplateEn}</div>}
                         <div className="text-sm"><span className="text-slate-400">النص (عربي):</span> {t.bodyTemplateAr || t.bodyTemplate}</div>
                         {t.bodyTemplateEn && <div className="text-sm"><span className="text-slate-400">النص (إنجليزي):</span> {t.bodyTemplateEn}</div>}
                       </div>
                        <div className="flex gap-2 mt-4 sm:mt-0">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                            onClick={() => handleOpenEditModal(t)}
                          >
                            تعديل
                          </Button>
                          <Button 
                            variant={t.isActive ? "destructive" : "default"} 
                            size="sm" 
                            className="rounded-xl"
                            onClick={() => toggleTemplate.mutate({ id: t.id, isActive: !t.isActive })}
                            disabled={toggleTemplate.isPending}
                          >
                            {t.isActive ? "إيقاف" : "تفعيل"}
                          </Button>
                        </div>
                     </div>
                   ))}
                   {templates?.filter(t => t.eventType !== 'manual_scheduled').length === 0 && (
                     <div className="text-center p-8 text-slate-500">لا توجد إشعارات تلقائية مبرمجة حتى الآن. ستبدأ في الظهور عندما يتم برمجتها في محرك النظام.</div>
                   )}
                 </div>
               )}
            </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="logs">
           <Card className="shadow-sm rounded-3xl border-white/50 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <History className="w-5 h-5" /> سجل الإرسال الأخير
              </CardTitle>
            </CardHeader>
            <CardContent>
               {logsLoading ? <div className="text-center p-8">جاري التحميل...</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-end">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="p-4 font-medium rounded-r-xl">رقم القالب</th>
                          <th className="p-4 font-medium">المستخدم</th>
                          <th className="p-4 font-medium">الوسيلة</th>
                          <th className="p-4 font-medium">التاريخ</th>
                          <th className="p-4 font-medium rounded-l-xl">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {logs?.map(log => (
                           <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                             <td className="p-4">#{log.templateId || "-"}</td>
                             <td className="p-4">{log.userType}:{log.userId}</td>
                             <td className="p-4"><Badge variant="outline">{log.sentVia}</Badge></td>
                             <td className="p-4">{log.sentAt ? format(new Date(log.sentAt), "yyyy-MM-dd HH:mm") : "-"}</td>
                             <td className="p-4">
                               {log.status === 'sent' ? 
                                 <CheckCircle className="w-4 h-4 text-green-500 inline" /> : 
                                 <XCircle className="w-4 h-4 text-red-500 inline" />
                               }
                             </td>
                           </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
               )}
            </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
      {editingTemplate && (
        <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl" dir="rtl">
            <DialogHeader className="text-right">
              <DialogTitle className="text-lg font-bold text-indigo-700 dark:text-indigo-400">
                تعديل إشعار تلقائي: {editingTemplate.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="grid gap-1 text-right">
                <Label className="text-xs font-bold text-slate-500">اسم القالب (توضيحي للأدمن)</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>

              {/* Conditional parameter inputs */}
              {(editingTemplate.eventType === "inactivity_reminder" || editingTemplate.eventType === "pro_conversion_streak") && (
                <div className="grid gap-1 text-right">
                  <Label className="text-xs font-bold text-slate-500">
                    الحد الأدنى للأيام المتتالية (Streak) المطلوبة للإطلاق
                  </Label>
                  <Input 
                    type="number" 
                    value={editStreak} 
                    onChange={e => setEditStreak(e.target.value)} 
                    placeholder={editingTemplate.eventType === "inactivity_reminder" ? "2" : "4"} 
                  />
                </div>
              )}

              {editingTemplate.eventType === "dormant_reactivation" && (
                <div className="grid gap-1 text-right">
                  <Label className="text-xs font-bold text-slate-500">
                    عدد أيام الغياب المطلوبة للإطلاق
                  </Label>
                  <Input 
                    type="number" 
                    value={editInactivityDays} 
                    onChange={e => setEditInactivityDays(e.target.value)} 
                    placeholder="7" 
                  />
                </div>
              )}

              <div className="flex justify-between items-center border-b pb-1.5 pt-2">
                <Label className="text-xs font-bold text-slate-500">نصوص الإشعار</Label>
                <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex gap-0.5">
                  <button
                    type="button"
                    className={cn("px-2.5 py-1 text-[10px] rounded-md font-bold transition-all", editLanguage === "ar" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "opacity-60 text-slate-500")}
                    onClick={() => setEditLanguage("ar")}
                  >
                    العربية
                  </button>
                  <button
                    type="button"
                    className={cn("px-2.5 py-1 text-[10px] rounded-md font-bold transition-all", editLanguage === "en" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "opacity-60 text-slate-500")}
                    onClick={() => setEditLanguage("en")}
                  >
                    English
                  </button>
                </div>
              </div>

              {editLanguage === "ar" ? (
                <div className="space-y-3 text-right animate-in fade-in duration-200">
                  <div className="grid gap-1">
                    <Label className="text-xs">العنوان بالعربية</Label>
                    <Input value={editTitleAr} onChange={e => setEditTitleAr(e.target.value)} dir="rtl" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">المحتوى بالعربية</Label>
                    <Textarea value={editBodyAr} onChange={e => setEditBodyAr(e.target.value)} rows={3} className="resize-none" dir="rtl" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-left animate-in fade-in duration-200">
                  <div className="grid gap-1">
                    <Label className="text-xs">Title (English)</Label>
                    <Input value={editTitleEn} onChange={e => setEditTitleEn(e.target.value)} dir="ltr" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Content (English)</Label>
                    <Textarea value={editBodyEn} onChange={e => setEditBodyEn(e.target.value)} rows={3} className="resize-none" dir="ltr" />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={handleSaveEdit} 
                  disabled={updateTemplate.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                >
                  {updateTemplate.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setEditingTemplate(null)}
                  className="rounded-xl"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
