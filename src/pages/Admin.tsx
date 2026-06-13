import { useState, useEffect } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import {
  Users,
  Shield,
  Trash2,
  Search,
  Download,
  Printer,
  Eye,
  XCircle,
  CheckCircle,
  Clock,
  Ticket,
  BarChart3,
  Activity,
  ChevronLeft,
  ChevronRight,
  Crown,
  UserCheck,
  FileSpreadsheet,
  FileJson,
  Brain,
  Mic,
  Settings2,
  Info,
  LayoutDashboard,
  Server,
  ShieldAlert,
  AlertCircle,
  Bell,
  MessageCircle,
  Megaphone,
  BookOpen,
  FileText,
  History,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";
import { NotificationsTab } from "@/components/admin/NotificationsTab";
import { ClarificationsTab } from "@/components/admin/ClarificationsTab";
import { AdminWhatsAppTab } from "@/components/admin/AdminWhatsAppTab";
import { AdminAdsTab } from "@/components/admin/AdminAdsTab";
import { AdminRulesTab } from "@/components/admin/AdminRulesTab";
import { AdminRawSmsTab } from "@/components/admin/AdminRawSmsTab";
import { AdminAuditTab } from "@/components/admin/AdminAuditTab";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Admin() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [userToDelete, setUserToDelete] = useState<any | null>(null);

  // Modal states for user-specific message popup
  const [messageUser, setMessageUser] = useState<any>(null);
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [messageText, setMessageText] = useState("");

  const sendWhatsappMutation = trpc.adminWhatsapp.sendDirectMessage.useMutation({
    onSuccess: (res) => {
      toast.success(res.message || "تم إرسال رسالة الواتساب بنجاح! 🎉");
      setMessageUser(null);
      setMessageText("");
    },
    onError: (err) => {
      toast.error(`فشل الإرسال: ${err.message}`);
    },
  });

  const {
    stats,
    users,
    updateRole,
    updatePlan,
    deleteUser,
    revokeSession,
    voiceUsage,
  } = useAdmin({
    dashboard: activeTab === "overview",
    users: activeTab === "users",
    activity: false,
    classification: activeTab === "ai",
    voice: activeTab === "ai",
  });

  const sessionsQuery = trpc.admin.getUserSessions.useQuery(
    { userId: selectedUser?.id, userType: selectedUser?.userType },
    { enabled: showSessions && !!selectedUser },
  );

  const profileQuery = trpc.admin.getUserSmartProfile.useQuery(
    { userId: selectedUser?.id, userType: selectedUser?.userType },
    { enabled: showProfile && !!selectedUser },
  );

  const ticketsQuery = trpc.support.listAll.useQuery(
    { page: 1, limit: 50 },
    { enabled: activeTab === "tickets" },
  );

  const founderQuery = trpc.admin.getFounderMetrics.useQuery(undefined, {
    enabled: activeTab === "overview" && user?.role === "admin",
    retry: 1,
  });

  const subsQuery = trpc.admin.listSubscriptionsAdmin.useQuery(
    { page: 1, limit: 20 },
    { enabled: activeTab === "billing" && user?.role === "admin" },
  );

  const closeTicket = trpc.support.close.useMutation({
    onSuccess: () => ticketsQuery.refetch(),
  });

  const exportMutation = trpc.export.allUsers.useMutation({
    onSuccess: (data) => {
      if (data.format === "json") {
        const blob = new Blob([JSON.stringify(data.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
      } else if (data.format === "csv") {
        const blob = new Blob(["\ufeff" + data.data], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
      } else if (data.format === "xlsx") {
        const binary = atob(data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
      }
      toast.success("تم تصدير البيانات بنجاح ✅");
      setShowExports(false);
    },
  });

  const respondTicket = trpc.support.respond.useMutation({
    onSuccess: () => ticketsQuery.refetch(),
  });

  const handlePrint = () => window.print();

  const filteredUsers =
    users.data?.users?.filter((u: any) => {
      const matchSearch =
        !search ||
        u.name?.includes(search) ||
        u.email?.includes(search) ||
        u.phone?.includes(search);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchPlan = planFilter === "all" || u.plan === planFilter;
      return matchSearch && matchRole && matchPlan;
    }) || [];

  if (user?.role !== "admin" && user?.role !== "moderator") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950">
        <Card className="p-10 text-center max-w-md border-rose-100 shadow-xl shadow-rose-100/50">
          <ShieldAlert className="w-20 h-20 text-rose-500 mx-auto mb-6" />
          <h2 className="text-3xl font-black mb-3 text-slate-800">
            وصول غير مصرح
          </h2>
          <p className="text-slate-500">
            هذه المنطقة مخصصة للإدارة العليا والمشرفين فقط. سيتم تسجيل محاولة
            الدخول الخاصة بك.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 dark:from-slate-950 dark:to-indigo-950/20 pb-20 font-sans"
      dir="rtl"
    >
      <SEOMeta path="/admin" title="لوحة التحكم الإدارية | SmartSpend" />

      {/* Top Navigation Bar */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-white/20 dark:border-slate-800 shadow-sm sticky top-0 z-30 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2 rounded-lg">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">
                  مركز القيادة
                </h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                  SmartSpend OS
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="hidden sm:flex gap-2"
              >
                <Printer className="w-4 h-4" /> طباعة
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowExports(true)}
                className="gap-2 bg-slate-800 hover:bg-slate-700"
              >
                <Download className="w-4 h-4" /> تصدير
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="no-print"
        >
          <TabsList className="mb-8 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/50 dark:border-slate-800 flex-wrap h-auto justify-start gap-1 w-full max-w-full">
            <TabsTrigger
              value="overview"
              className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-900/30 transition-all"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" /> نظرة عامة
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 transition-all"
            >
              <Users className="w-4 h-4 shrink-0" /> المستخدمين
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-900/30 transition-all"
            >
              <Ticket className="w-4 h-4 shrink-0" /> الدعم
            </TabsTrigger>
            {user?.role === "admin" && (
              <>
                <TabsTrigger
                  value="ai"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30 transition-all"
                >
                  <Brain className="w-4 h-4 shrink-0" /> الذكاء الاصطناعي
                </TabsTrigger>

                <TabsTrigger
                  value="billing"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900/30 transition-all"
                >
                  <Crown className="w-4 h-4 shrink-0" /> الاشتراكات
                </TabsTrigger>
                <TabsTrigger
                  value="clarifications"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-900/30 transition-all"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" /> التوضيحات المعلقة
                </TabsTrigger>
                <TabsTrigger
                  value="whatsapp"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-green-50 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-900/30 transition-all"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" /> الواتساب
                </TabsTrigger>
                <TabsTrigger
                  value="ads"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700 dark:data-[state=active]:bg-pink-900/30 transition-all"
                >
                  <Megaphone className="w-4 h-4 shrink-0" /> الحملات الإعلانية
                </TabsTrigger>
                <TabsTrigger
                  value="rules"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 dark:data-[state=active]:bg-teal-900/30 transition-all"
                >
                  <BookOpen className="w-4 h-4 shrink-0" /> القاموس والقواعد
                </TabsTrigger>
                <TabsTrigger
                  value="raw-sms"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-900/30 transition-all"
                >
                  <FileText className="w-4 h-4 shrink-0" /> سجل الـ SMS
                </TabsTrigger>
                <TabsTrigger
                  value="audit"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 transition-all"
                >
                  <History className="w-4 h-4 shrink-0" /> سجل الرقابة
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700 dark:data-[state=active]:bg-sky-900/30 transition-all"
                >
                  <Bell className="w-4 h-4 shrink-0" /> الإشعارات
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="gap-2 py-2.5 px-3 sm:px-4 rounded-xl data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 transition-all"
                >
                  <Settings2 className="w-4 h-4 shrink-0" /> الحدود والإعدادات
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <div className="animate-in fade-in-50 duration-500 slide-in-from-bottom-4">
            {/* 1. Overview */}
            <TabsContent value="overview">
              {stats.isError && (
                <Card className="mb-6 border-destructive/30">
                  <CardContent className="py-4 text-sm text-destructive">
                    تعذّر تحميل إحصائيات اللوحة: {stats.error?.message}
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  icon={<Users className="w-6 h-6" />}
                  label="إجمالي المسجلين"
                  value={stats.data?.totalUsers ?? 0}
                  color="blue"
                />
                <StatCard
                  icon={<Crown className="w-6 h-6" />}
                  label="مشتركين البرو والألترا"
                  value={stats.data?.proUsers ?? 0}
                  color="yellow"
                />
                <StatCard
                  icon={<Activity className="w-6 h-6" />}
                  label="متصلين الآن (جلسات)"
                  value={stats.data?.activeSessions ?? 0}
                  color="green"
                />
                <StatCard
                  icon={<Ticket className="w-6 h-6" />}
                  label="تذاكر دعم مفتوحة"
                  value={stats.data?.openTickets ?? 0}
                  color="red"
                />

                <StatCard
                  icon={<BarChart3 className="w-6 h-6" />}
                  label="حجم المعاملات المالي"
                  value={`${Number(stats.data?.totalAmount || 0).toLocaleString()} ج.م`}
                  color="purple"
                />
                <StatCard
                  icon={<Clock className="w-6 h-6" />}
                  label="تدفقات اليوم"
                  value={`${Number(stats.data?.todayExpenses || 0).toLocaleString()} ج.م`}
                  color="orange"
                />

                <StatCard
                  icon={<Users className="w-6 h-6" />}
                  label="تسجيل عبر جوجل"
                  value={stats.data?.totalOAuthUsers ?? 0}
                  color="indigo"
                />
                <StatCard
                  icon={<UserCheck className="w-6 h-6" />}
                  label="تسجيل محلي"
                  value={stats.data?.totalLocalUsers ?? 0}
                  color="teal"
                />
              </div>

              {user?.role === "admin" && founderQuery.data && (
                <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatCard
                    icon={<Activity className="w-5 h-5" />}
                    label="DAU"
                    value={founderQuery.data.dau}
                    color="green"
                  />
                  <StatCard
                    icon={<Users className="w-5 h-5" />}
                    label="WAU"
                    value={founderQuery.data.wau}
                    color="blue"
                  />
                  <StatCard
                    icon={<Crown className="w-5 h-5" />}
                    label="Pro جديد (7 أيام)"
                    value={founderQuery.data.newProSubs7d}
                    color="yellow"
                  />
                  <StatCard
                    icon={<Crown className="w-5 h-5" />}
                    label="Pro نشط"
                    value={founderQuery.data.activeProSubs}
                    color="yellow"
                  />
                  <StatCard
                    icon={<Brain className="w-5 h-5" />}
                    label="توكنز AI (تقريبي)"
                    value={founderQuery.data.estimatedTokensUsed.toLocaleString()}
                    color="purple"
                  />
                  <StatCard
                    icon={<BarChart3 className="w-5 h-5" />}
                    label="ترقيات Pro"
                    value={founderQuery.data.upgradeEvents}
                    color="indigo"
                  />
                </div>
              )}
            </TabsContent>

            {/* 2. Users Tab */}
            <TabsContent value="users" className="space-y-6">
              <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 p-4 sm:p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">
                      قاعدة بيانات المستخدمين
                    </CardTitle>
                    <CardDescription>
                      إدارة {filteredUsers.length} حساب مسجل بالنظام
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64 min-w-[200px]">
                      <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="بحث بالاسم، الإيميل، رقم الهاتف..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pe-10 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger className="w-32 bg-white dark:bg-slate-950">
                        <SelectValue placeholder="الصلاحية" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل (الصلاحيات)</SelectItem>
                        <SelectItem value="user">مستخدم عادي</SelectItem>
                        <SelectItem value="moderator">مشرف</SelectItem>
                        <SelectItem value="admin">إدارة عليا</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                      <SelectTrigger className="w-32 bg-white dark:bg-slate-950">
                        <SelectValue placeholder="الباقة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل (الباقات)</SelectItem>
                        <SelectItem value="free">المجانية</SelectItem>
                        <SelectItem value="pro">باقة البرو</SelectItem>
                        <SelectItem value="ultra">باقة الألترا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-end">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-medium border-b">
                      <tr>
                        <th className="py-4 px-6 min-w-[200px]">
                          معلومات الحساب
                        </th>
                        <th className="py-4 px-4 min-w-[120px]">نوع التسجيل</th>
                        <th className="py-4 px-4 min-w-[130px]">الصلاحية</th>
                        <th className="py-4 px-4 min-w-[130px]">
                          الباقة الحالية
                        </th>
                        <th className="py-4 px-4 min-w-[150px]">
                          إحصائيات النشاط
                        </th>
                        <th className="py-4 px-4 min-w-[130px]">استهلاك AI</th>
                        <th className="py-4 px-4 min-w-[120px]">آخر تواجد</th>
                        {user?.role === "admin" && (
                          <th className="py-4 px-6 min-w-[120px] text-center">
                            إدارة
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u: any) => (
                        <tr
                          key={`${u.userType}-${u.id}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                                {u.name?.[0] || "?"}
                              </div>
                              <div className="max-w-[200px]">
                                <p
                                  className="font-bold text-slate-900 dark:text-slate-100 truncate"
                                  title={u.name}
                                >
                                  {u.name}
                                </p>
                                <p
                                  className="text-xs text-slate-500 truncate"
                                  title={u.email || u.phone}
                                >
                                  {u.email || u.phone}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <Badge
                              variant="outline"
                              className={
                                u.userType === "oauth"
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                              }
                            >
                              {u.userType === "oauth"
                                ? "Google OAuth"
                                : "Local Auth"}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            {user?.role === "admin" ? (
                              <Select
                                value={u.role || "user"}
                                onValueChange={(v) =>
                                  updateRole.mutate({
                                    userId: u.id,
                                    userType: u.userType,
                                    role: v as any,
                                  })
                                }
                              >
                                <SelectTrigger className="w-28 h-8 text-xs bg-white dark:bg-slate-950">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">
                                    مستخدم عادي
                                  </SelectItem>
                                  <SelectItem value="moderator">
                                    مشرف نظام
                                  </SelectItem>
                                  <SelectItem value="admin">
                                    إدارة عليا
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge
                                variant={
                                  u.role === "admin"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {u.role || "user"}
                              </Badge>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {user?.role === "admin" ? (
                              <Select
                                value={u.plan || "free"}
                                onValueChange={(v) =>
                                  updatePlan.mutate({
                                    userId: u.id,
                                    userType: u.userType,
                                    plan: v as any,
                                  })
                                }
                              >
                                <SelectTrigger className="w-28 h-8 text-xs bg-white dark:bg-slate-950">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">المجانية</SelectItem>
                                  <SelectItem value="pro">برو ⭐</SelectItem>
                                  <SelectItem value="ultra">
                                    ألترا 💎
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{u.plan}</Badge>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-bold text-slate-700 dark:text-slate-300">
                              {Number(u.totalSpent || 0).toLocaleString()} ج.م
                            </p>
                            <p className="text-xs text-slate-500">
                              {u.expenseCount || 0} عملية مسجلة
                            </p>
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="secondary" className="font-mono">
                              {Number(u.aiTokensUsed || 0).toLocaleString()} T
                            </Badge>
                          </td>
                          <td className="py-4 px-4 text-xs text-slate-500 font-mono">
                            {u.lastSignInAt
                              ? new Date(u.lastSignInAt).toLocaleDateString(
                                  "ar-EG",
                                )
                              : "غير متوفر"}
                          </td>
                          {user?.role === "admin" && (
                            <td className="py-4 px-6">
                              <div className="flex gap-2 justify-center">
                                 <Button
                                   size="icon"
                                   variant="outline"
                                   className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 border-blue-100 text-blue-500"
                                   onClick={() => {
                                     setMessageUser(u);
                                     setMessageChannel(u.phone ? "whatsapp" : "email");
                                   }}
                                   title="إرسال رسالة"
                                 >
                                   <MessageCircle className="w-4 h-4" />
                                 </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 border-emerald-100 text-emerald-500"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setShowProfile(true);
                                  }}
                                  title="عرض البروفايل"
                                >
                                  <UserCheck className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 hover:bg-slate-100"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setShowSessions(true);
                                  }}
                                  title="سجل الجلسات"
                                >
                                  <Eye className="w-4 h-4 text-slate-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 hover:bg-rose-50 hover:text-rose-600 border-rose-100 text-rose-500"
                                  onClick={() => {
                                    setUserToDelete(u);
                                  }}
                                  title="حذف الحساب"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={8}
                            className="py-8 text-center text-slate-500"
                          >
                            لا يوجد مستخدمين يطابقون بحثك.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            {/* 3. Tickets Tab */}
            <TabsContent value="tickets">
              <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
                <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 p-6">
                  <CardTitle>مركز الدعم الفني والمساعدة</CardTitle>
                  <CardDescription>
                    متابعة والرد على استفسارات ومشكلات المستخدمين (
                    {ticketsQuery.data?.total ?? 0})
                  </CardDescription>
                </div>
                <div className="p-6 space-y-4 bg-slate-50/30">
                  {ticketsQuery.data?.list?.map((t: any) => (
                    <div
                      key={t.id}
                      className="bg-white dark:bg-slate-950 border rounded-xl p-5 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                              {t.userAvatar ? (
                                <img
                                  src={t.userAvatar}
                                  alt=""
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <UserCheck className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200 block leading-none">
                                {t.userName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(t.createdAt).toLocaleString("ar-EG")}
                              </span>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-base text-indigo-900 dark:text-indigo-300">
                                {t.subject}
                              </h4>
                              <Badge
                                variant={
                                  t.status === "open"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {t.status === "open" ? "مفتوحة" : "مغلقة"}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">
                              {t.message}
                            </p>
                          </div>

                          {t.response && (
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 rounded-lg p-4 mt-2">
                              <p className="text-xs text-emerald-600 font-bold mb-1 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> رد الإدارة:
                              </p>
                              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                                {t.response}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      {(user?.role === "admin" || user?.role === "moderator") &&
                        t.status !== "closed" && (
                          <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row gap-3">
                            <Input
                              placeholder="اكتب ردك هنا ثم اضغط Enter للإرسال..."
                              className="flex-1 bg-slate-50 dark:bg-slate-900 min-h-[44px]"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const target = e.target as HTMLInputElement;
                                  if (target.value.trim()) {
                                    respondTicket.mutate({
                                      id: t.id,
                                      response: target.value,
                                      status: "resolved",
                                    });
                                    target.value = "";
                                  }
                                }
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px]"
                              disabled={closeTicket.isPending}
                              onClick={() => closeTicket.mutate({ id: t.id })}
                            >
                              إغلاق التذكرة
                            </Button>
                          </div>
                        )}
                    </div>
                  ))}
                  {ticketsQuery.data?.list?.length === 0 && (
                    <div className="text-center p-10 text-slate-400">
                      لا توجد تذاكر دعم فني حالياً.
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            {user?.role === "admin" && (
              <>
                <TabsContent value="whatsapp" className="space-y-6">
                  <AdminWhatsAppTab />
                </TabsContent>

                <TabsContent value="ai" className="space-y-8">
                  <ApiKeyErrorsPanel />
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-600" />
                      تصنيف المصروفات (Free / Pro)
                    </h2>
                    <ClassificationDashboard />
                  </section>
                  <section>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Mic className="w-5 h-5 text-emerald-600" />
                      استخدام الصوت
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {voiceUsage.data?.usage?.map((row: any) => (
                        <StatCard
                          key={row.userType}
                          icon={<Mic className="w-5 h-5" />}
                          label={row.userType === "oauth" ? "OAuth" : "محلي"}
                          value={`${Math.round(Number(row.totalSeconds || 0) / 60)} دقيقة`}
                          color="teal"
                        />
                      )) ?? (
                        <p className="text-sm text-muted-foreground col-span-2">
                          لا توجد بيانات صوت لهذا الشهر.
                        </p>
                      )}
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="billing">
                  <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-amber-500" />
                        اشتراكات Pro
                      </CardTitle>
                      <CardDescription>
                        آخر {subsQuery.data?.list?.length ?? 0} اشتراك
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm text-end">
                        <thead className="text-muted-foreground border-b">
                          <tr>
                            <th className="py-2 px-3">المستخدم</th>
                            <th className="py-2 px-3">الخطة</th>
                            <th className="py-2 px-3">الحالة</th>
                            <th className="py-2 px-3">الدفع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subsQuery.data?.list?.map((s: any) => (
                            <tr key={s.id} className="border-b last:border-0">
                              <td className="py-2 px-3 font-mono">
                                {s.userType}:{s.userId}
                              </td>
                              <td className="py-2 px-3">{s.plan}</td>
                              <td className="py-2 px-3">{s.status}</td>
                              <td className="py-2 px-3">
                                {s.paymentMethod || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {subsQuery.isError && (
                        <p className="text-sm text-destructive mt-4">
                          {subsQuery.error?.message}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>


                <TabsContent value="notifications">
                  <NotificationsTab />
                </TabsContent>

                <TabsContent value="ads">
                  <AdminAdsTab />
                </TabsContent>

                <TabsContent value="rules">
                  <AdminRulesTab />
                </TabsContent>

                <TabsContent value="raw-sms">
                  <AdminRawSmsTab />
                </TabsContent>

                <TabsContent value="audit">
                  <AdminAuditTab />
                </TabsContent>

                <TabsContent value="settings">
                  <AdminSettingsTab />
                </TabsContent>
                <TabsContent value="clarifications" className="space-y-6">
                  <ClarificationsTab />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>

      {/* Premium Delete User Dialog */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent className="max-w-sm p-6 rounded-3xl" dir="rtl">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-full">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                حذف حساب المستخدم نهائياً؟
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                تحذير: سيتم حذف بيانات المستخدم <span className="font-bold text-rose-600">"{userToDelete?.name}"</span> بالكامل بما في ذلك المصروفات والملف الذكي والجلسات. هذا الإجراء غير قابل للتراجع.
              </p>
            </div>
            <div className="flex gap-3 w-full pt-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setUserToDelete(null)}
              >
                إلغاء
              </Button>
              <Button
                className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
                disabled={deleteUser.isPending}
                onClick={() => {
                  if (userToDelete) {
                    deleteUser.mutate({
                      userId: userToDelete.id,
                      userType: userToDelete.userType,
                    });
                    setUserToDelete(null);
                  }
                }}
              >
                {deleteUser.isPending ? "جاري الحذف..." : "نعم، احذف نهائياً"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <Dialog open={showSessions} onOpenChange={setShowSessions}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-slate-50 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              سجل الجلسات والأمان - {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
            {sessionsQuery.data?.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-xl shadow-sm"
              >
                <div>
                  <p className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {s.ipAddress || "Unknown IP"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg truncate mt-1">
                    {s.userAgent}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-2">
                    تنتهي الصلاحية:{" "}
                    {new Date(s.expiresAt).toLocaleString("ar-EG")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 border-rose-100"
                  onClick={() => revokeSession.mutate({ sessionId: s.id })}
                >
                  إنهاء الجلسة
                </Button>
              </div>
            ))}
            {sessionsQuery.data?.length === 0 && (
              <p className="text-center text-slate-400 py-10">
                لا توجد جلسات نشطة حالياً
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden max-h-[85vh]">
          <DialogHeader className="p-6 bg-gradient-to-r from-emerald-50 to-sky-50 dark:from-emerald-950/30 dark:to-sky-950/30 border-b">
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              بروفايل المستخدم — {selectedUser?.name || "مستخدم"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh]" dir="rtl">
            {profileQuery.isLoading && (
              <p className="text-center text-slate-400 py-10">
                جاري تحميل البروفايل...
              </p>
            )}
            {profileQuery.data &&
              (() => {
                const p = profileQuery.data as any;
                const fi = p.financialInfo || {};
                const li = p.lifestyleInfo || {};
                const bi = p.basicInfo || {};
                const prefs = p.preferences || {};
                const answers = p.onboardingAnswers || {};
                const answeredCount = Object.keys(answers).length;

                const InfoRow = ({
                  label,
                  value,
                }: {
                  label: string;
                  value: string;
                }) => (
                  <div className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm text-muted-foreground">
                      {label}
                    </span>
                    <span className="text-sm font-medium">{value || "—"}</span>
                  </div>
                );

                return (
                  <div className="space-y-5">
                    {/* Identity */}
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Users className="w-4 h-4" /> الهوية
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <InfoRow
                          label="الاسم"
                          value={bi.name || selectedUser?.name}
                        />
                        <InfoRow
                          label="الهاتف"
                          value={bi.phone || selectedUser?.phone || "—"}
                        />
                        <InfoRow
                          label="البريد"
                          value={bi.email || selectedUser?.email || "—"}
                        />
                        <InfoRow
                          label="المهنة"
                          value={String(bi.profession || "—")}
                        />
                        <InfoRow
                          label="الإجابات المكتملة"
                          value={`${answeredCount} / 19`}
                        />
                        <InfoRow
                          label="البروفايل مكتمل"
                          value={p.profileCompleted ? "✅ نعم" : "❌ لا"}
                        />
                      </CardContent>
                    </Card>

                    {/* Financial */}
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" /> الوضع المالي
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <InfoRow
                          label="الدخل الشهري"
                          value={
                            fi.averageMonthlyIncome
                              ? `${Number(fi.averageMonthlyIncome).toLocaleString()} ج.م`
                              : "—"
                          }
                        />
                        <InfoRow
                          label="مصادر الدخل"
                          value={
                            Array.isArray(fi.incomeSources)
                              ? fi.incomeSources.join("، ")
                              : "—"
                          }
                        />
                        <InfoRow
                          label="الهدف"
                          value={String(fi.primaryGoal || "—")}
                        />
                        <InfoRow
                          label="ديون/أقساط"
                          value={
                            fi.hasDebt === true
                              ? `نعم (${fi.monthlyDebtPayment || "؟"} ج.م/شهر)`
                              : fi.hasDebt === false
                                ? "لا"
                                : "—"
                          }
                        />
                      </CardContent>
                    </Card>

                    {/* Lifestyle */}
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="w-4 h-4" /> نمط الحياة
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <InfoRow
                          label="أطفال"
                          value={
                            li.hasChildren
                              ? `نعم (${li.childrenCount || ""})`
                              : "لا"
                          }
                        />
                        {Array.isArray(li.childrenNames) &&
                          li.childrenNames.length > 0 && (
                            <InfoRow
                              label="أسماء الأطفال"
                              value={li.childrenNames.join("، ")}
                            />
                          )}
                        {li.partnerName && (
                          <InfoRow
                            label="شريك الحياة"
                            value={String(li.partnerName)}
                          />
                        )}
                        <InfoRow
                          label="وضع السكن"
                          value={String(li.livingSituation || "—")}
                        />
                        <InfoRow
                          label="نوع السكن"
                          value={String(li.housingType || "—")}
                        />
                        {li.monthlyRent && (
                          <InfoRow
                            label="الإيجار"
                            value={`${Number(li.monthlyRent).toLocaleString()} ج.م`}
                          />
                        )}
                        <InfoRow
                          label="يدعم مالياً"
                          value={
                            Array.isArray(li.supportsOthers)
                              ? li.supportsOthers.join("، ")
                              : "—"
                          }
                        />
                        <InfoRow
                          label="سيارة"
                          value={
                            li.carOwnership
                              ? `${li.carType || "نعم"}${li.monthlyCarCost ? ` (${Number(li.monthlyCarCost).toLocaleString()} ج/شهر)` : ""}`
                              : "لا"
                          }
                        />
                        <InfoRow
                          label="تدخين"
                          value={li.smoking ? "نعم 🚬" : "لا"}
                        />
                        {Array.isArray(li.petNames) &&
                          li.petNames.length > 0 && (
                            <InfoRow
                              label="حيوانات أليفة"
                              value={li.petNames.join("، ")}
                            />
                          )}
                        {Array.isArray(li.subscriptions) &&
                          li.subscriptions.length > 0 && (
                            <InfoRow
                              label="اشتراكات"
                              value={li.subscriptions.join("، ")}
                            />
                          )}
                        {Array.isArray(li.regularContacts) &&
                          li.regularContacts.length > 0 && (
                            <InfoRow
                              label="أشخاص بيحولهم فلوس"
                              value={li.regularContacts.join("، ")}
                            />
                          )}
                      </CardContent>
                    </Card>

                    {/* Raw onboarding answers */}
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Brain className="w-4 h-4" /> إجابات الـ Onboarding (
                          {answeredCount})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {Object.entries(answers).map(
                          ([key, ans]: [string, any]) => (
                            <InfoRow
                              key={key}
                              label={key}
                              value={
                                ans?.skipped
                                  ? "⏭️ تم تخطيه"
                                  : JSON.stringify(ans?.value)
                              }
                            />
                          ),
                        )}
                        {answeredCount === 0 && (
                          <p className="text-center text-sm text-slate-400 py-4">
                            لم يجب على أي سؤال بعد
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExports} onOpenChange={setShowExports}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تصدير قاعدة البيانات</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-4">
            <Button
              className="w-full justify-start h-12 text-base"
              variant="outline"
              onClick={() => exportMutation.mutate({ format: "xlsx" })}
            >
              <FileSpreadsheet className="w-5 h-5 ms-3 text-emerald-600" />{" "}
              تصدير كملف Excel (.xlsx)
            </Button>
            <Button
              className="w-full justify-start h-12 text-base"
              variant="outline"
              onClick={() => exportMutation.mutate({ format: "csv" })}
            >
              <FileJson className="w-5 h-5 ms-3 text-blue-600" /> تصدير كملف CSV
            </Button>
            <Button
              className="w-full justify-start h-12 text-base"
              variant="outline"
              onClick={() => exportMutation.mutate({ format: "json" })}
            >
              <FileJson className="w-5 h-5 ms-3 text-amber-600" /> تصدير كملف
              JSON (نسخة احتياطية للمطورين)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message User Dialog */}
      <Dialog open={!!messageUser} onOpenChange={(open) => !open && setMessageUser(null)}>
        <DialogContent className="max-w-md p-6 overflow-hidden rounded-3xl" dir="rtl">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <MessageCircle className="w-6 h-6 text-green-500" />
              مراسلة المستخدم: {messageUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>طريقة المراسلة</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={messageChannel === "whatsapp" ? "default" : "outline"}
                  onClick={() => setMessageChannel("whatsapp")}
                  disabled={!messageUser?.phone}
                  className="rounded-xl flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  الواتساب
                </Button>
                <Button
                  type="button"
                  variant={messageChannel === "email" ? "default" : "outline"}
                  onClick={() => setMessageChannel("email")}
                  disabled={!messageUser?.email}
                  className="rounded-xl flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  البريد الإلكتروني
                </Button>
              </div>
              {!messageUser?.phone && messageChannel === "whatsapp" && (
                <p className="text-xs text-rose-500 mt-1">هذا الحساب لا يملك رقم هاتف مسجل</p>
              )}
              {!messageUser?.email && messageChannel === "email" && (
                <p className="text-xs text-rose-500 mt-1">هذا الحساب لا يملك بريد إلكتروني مسجل</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>نص الرسالة</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="min-h-[120px] rounded-xl resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setMessageUser(null)}
                className="rounded-xl"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (messageChannel === "whatsapp") {
                    sendWhatsappMutation.mutate({
                      phone: messageUser.phone,
                      text: messageText,
                    });
                  } else {
                    // Send Email via mailto link
                    const mailtoUrl = `mailto:${messageUser.email}?subject=SmartSpend&body=${encodeURIComponent(messageText)}`;
                    window.open(mailtoUrl, "_blank");
                    setMessageUser(null);
                    setMessageText("");
                    toast.success("تم فتح عميل البريد الإلكتروني الخاص بك لإرسال الرسالة.");
                  }
                }}
                disabled={!messageText.trim() || sendWhatsappMutation.isPending}
                className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
              >
                {sendWhatsappMutation.isPending ? "جاري الإرسال..." : "إرسال الآن"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  const colors: Record<string, { bg: string; text: string; shadow: string }> = {
    blue: {
      bg: "bg-blue-500/10",
      text: "text-blue-600",
      shadow: "shadow-blue-500/10",
    },
    green: {
      bg: "bg-green-500/10",
      text: "text-green-600",
      shadow: "shadow-green-500/10",
    },
    red: {
      bg: "bg-red-500/10",
      text: "text-red-600",
      shadow: "shadow-red-500/10",
    },
    yellow: {
      bg: "bg-yellow-500/10",
      text: "text-amber-600",
      shadow: "shadow-amber-500/10",
    },
    purple: {
      bg: "bg-purple-500/10",
      text: "text-purple-600",
      shadow: "shadow-purple-500/10",
    },
    orange: {
      bg: "bg-orange-500/10",
      text: "text-orange-600",
      shadow: "shadow-orange-500/10",
    },
    indigo: {
      bg: "bg-indigo-500/10",
      text: "text-indigo-600",
      shadow: "shadow-indigo-500/10",
    },
    teal: {
      bg: "bg-teal-500/10",
      text: "text-teal-600",
      shadow: "shadow-teal-500/10",
    },
  };
  const theme = colors[color] || colors.blue;

  return (
    <Card
      className={`border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${theme.shadow}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-2xl ${theme.bg} ${theme.text}`}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          {value}
        </p>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
          {label}
        </p>
      </CardContent>
    </Card>
  );
}

function ApiKeyErrorsPanel() {
  const utils = trpc.useUtils();
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const errorsQuery = trpc.admin.getApiKeyErrors.useQuery(
    { unresolvedOnly, limit: 50 },
    { refetchInterval: 60_000 },
  );
  const resolveOne = trpc.admin.resolveApiKeyError.useMutation({
    onSuccess: () => {
      toast.success("تم تعليم الخطأ كمحلول");
      utils.admin.getApiKeyErrors.invalidate();
    },
  });
  const clearAll = trpc.admin.clearAllApiKeyErrors.useMutation({
    onSuccess: () => {
      toast.success("تم حل كل أخطاء المفاتيح المفتوحة");
      utils.admin.getApiKeyErrors.invalidate();
    },
  });

  const errors = errorsQuery.data || [];
  const unresolvedCount = errors.filter((err: any) => !err.resolved).length;
  const badgeVariant = (type: string) => {
    if (["invalid_key", "model_not_found", "permission_denied"].includes(type))
      return "destructive";
    if (
      ["quota_exceeded", "rate_limited", "insufficient_credit"].includes(type)
    )
      return "secondary";
    return "outline";
  };

  return (
    <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-rose-500">
      <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            مراقبة أخطاء مفاتيح الذكاء الاصطناعي
          </CardTitle>
          <CardDescription>
            يعرض أخطاء Gemini و Groq التي كانت سابقا تظهر في السيرفر فقط وتسبب
            fallback صامت.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={unresolvedCount > 0 ? "destructive" : "secondary"}
            className="self-center"
          >
            {unresolvedCount} مفتوح
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUnresolvedOnly((v) => !v)}
          >
            {unresolvedOnly ? "عرض الكل" : "المفتوحة فقط"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={clearAll.isPending || unresolvedCount === 0}
            onClick={() => clearAll.mutate()}
          >
            حل الكل
          </Button>
        </div>
      </div>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-end">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 border-b">
              <tr>
                <th className="py-3 px-6">المصدر</th>
                <th className="py-3 px-4">النوع</th>
                <th className="py-3 px-4">المفتاح</th>
                <th className="py-3 px-4">الرسالة</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-6">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {errorsQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    جاري تحميل الأخطاء...
                  </td>
                </tr>
              )}
              {!errorsQuery.isLoading && errors.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    لا توجد أخطاء مفاتيح مطابقة.
                  </td>
                </tr>
              )}
              {errors.map((err: any) => (
                <tr
                  key={err.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                >
                  <td className="py-3 px-6 font-mono text-xs font-bold uppercase">
                    {err.provider}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={badgeVariant(err.errorType) as any}>
                      {err.errorType}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    {err.keyLabel}
                  </td>
                  <td className="py-3 px-4 max-w-[420px]">
                    <p
                      className="truncate text-slate-600 dark:text-slate-300"
                      title={err.message}
                    >
                      {err.message}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {err.httpStatus ? `HTTP ${err.httpStatus} - ` : ""}
                      {new Date(err.createdAt).toLocaleString("ar-EG")}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={err.resolved ? "secondary" : "destructive"}>
                      {err.resolved ? "محلول" : "مفتوح"}
                    </Badge>
                  </td>
                  <td className="py-3 px-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={err.resolved || resolveOne.isPending}
                      onClick={() => resolveOne.mutate({ errorId: err.id })}
                    >
                      تم الحل
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ClassificationDashboard() {
  const { classificationStats, classificationLogs } = useAdmin({
    classification: true,
  });
  const [logTab, setLogTab] = useState("all");

  const filteredLogs =
    classificationLogs.data?.logs?.filter((l: any) => {
      if (logTab === "all") return true;
      if (logTab === "free") return l.userPlan === "free";
      return l.userPlan === "pro" || l.userPlan === "ultra";
    }) || [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {classificationStats.data?.stats.map((s: any) => (
          <Card
            key={s.parsedBy}
            className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden border-t-4 border-t-indigo-500"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <Badge
                  variant={
                    s.parsedBy === "ai"
                      ? "default"
                      : s.parsedBy === "rule_engine"
                        ? "secondary"
                        : "outline"
                  }
                  className="px-3 py-1"
                >
                  {s.parsedBy === "ai"
                    ? "🤖 ذكاء اصطناعي عميق"
                    : s.parsedBy === "rule_engine"
                      ? "⚡ محرك القواعد"
                      : "🔀 هجين"}
                </Badge>
              </div>
              <p className="text-4xl font-black text-slate-800">{s.count}</p>
              <p className="text-sm font-bold text-slate-500 mt-1">
                عملية معالجة
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between text-xs font-mono text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" /> دقة:{" "}
                  {Math.round(Number(s.avgConfidence) || 0)}%
                </span>
                <span className="flex items-center gap-1">
                  <Brain className="w-3 h-3 text-indigo-400" />{" "}
                  {Number(s.totalTokens).toLocaleString()} Token
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-white/20 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>
              مراقب التصنيف المباشر (Classification Live Feed)
            </CardTitle>
            <CardDescription>
              أحدث عمليات المعالجة التي مرت عبر المحرك الذكي
            </CardDescription>
          </div>
          <Tabs
            value={logTab}
            onValueChange={setLogTab}
            className="w-full sm:w-[300px]"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="pro">البرو</TabsTrigger>
              <TabsTrigger value="free">المجاني</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 border-b font-medium text-end">
                <tr>
                  <th className="py-3 px-6">المستخدم</th>
                  <th className="py-3 px-4">النص الأصلي</th>
                  <th className="py-3 px-4">المحرك</th>
                  <th className="py-3 px-4">موديل الصوت (STT)</th>
                  <th className="py-3 px-4">الموديل (Model)</th>
                  <th className="py-3 px-4">استهلاك (Tokens)</th>
                  <th className="py-3 px-4">درجة الثقة</th>
                  <th className="py-3 px-4">القرار المتخذ</th>
                  <th className="py-3 px-6">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((l: any) => (
                  <tr
                    key={l.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-3 px-6 font-bold text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2 max-w-[150px]">
                        <span className="truncate" title={l.userName}>
                          {l.userName}
                        </span>
                        {l.userPlan && (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase shrink-0"
                          >
                            {l.userPlan}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td
                      className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium max-w-[200px] truncate"
                      title={l.originalText}
                    >
                      "{l.originalText}"
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant="outline"
                        className="bg-white dark:bg-slate-950"
                      >
                        {l.parsedBy}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 max-w-[150px]">
                      {(() => {
                        let sttModel = null;
                        if (l.modelUsed?.startsWith("STT: ")) {
                          const parts = l.modelUsed.split(" | Parse: ");
                          sttModel = parts[0].replace("STT: ", "");
                        }
                        
                        return sttModel ? (
                          <div
                            className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 truncate"
                            title={sttModel}
                          >
                            {sttModel}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 max-w-[150px]">
                      {(() => {
                        let parseModel = l.modelUsed;
                        if (l.modelUsed?.startsWith("STT: ")) {
                          const parts = l.modelUsed.split(" | Parse: ");
                          parseModel = parts[1] || parseModel;
                        }

                        return parseModel ? (
                          <div
                            className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300 truncate"
                            title={parseModel}
                          >
                            {parseModel}
                          </div>
                        ) : (
                          <div
                            className="font-mono text-xs bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded text-indigo-600 dark:text-indigo-400 truncate"
                            title={l.parsedBy}
                          >
                            {l.parsedBy === "rule_engine"
                              ? "محرك القواعد (سريع)"
                              : l.parsedBy === "embedding"
                                ? "البحث الدلالي"
                                : l.parsedBy}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      {l.tokensUsed !== null && l.tokensUsed !== undefined ? (
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {Number(l.tokensUsed).toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const conf = Number(l.confidence || 0);
                        return (
                          <span
                            className={`font-mono font-bold px-2 py-1 rounded-md text-xs ${conf >= 85 ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400" : conf >= 60 ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"}`}
                          >
                            {conf}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          l.decision === "auto_save"
                            ? "default"
                            : l.decision === "review"
                              ? "secondary"
                              : "destructive"
                        }
                        className="text-xs"
                      >
                        {l.decision === "auto_save"
                          ? "حفظ تلقائي"
                          : l.decision === "review"
                            ? "مراجعة يدوية"
                            : "فشل/رفض"}
                      </Badge>
                    </td>
                    <td className="py-3 px-6 text-xs text-slate-400 font-mono">
                      {new Date(l.createdAt).toLocaleString("ar-EG", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      لا توجد عمليات تصنيف مطابقة للبحث.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


