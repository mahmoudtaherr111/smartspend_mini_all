import { useState } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "../hooks/useAdmin";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { AiCommandCenter } from "../components/admin/ai-center/AiCommandCenter";
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
  ArrowRight,
  ChevronDown,
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
import { AdminUserMobileCard } from "@/components/admin/AdminUserMobileCard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const ADMIN_SECTIONS = [
  {
    value: "overview",
    label: "نظرة عامة",
    description: "ملخص الأداء والنشاط",
    icon: LayoutDashboard,
    activeClass:
      "data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-900/30",
  },
  {
    value: "users",
    label: "المستخدمون",
    description: "الحسابات والصلاحيات",
    icon: Users,
    activeClass:
      "data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30",
  },
  {
    value: "tickets",
    label: "الدعم",
    description: "التذاكر والردود",
    icon: Ticket,
    activeClass:
      "data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-900/30",
  },
  {
    value: "ai",
    label: "الذكاء الاصطناعي",
    description: "الجودة والتكلفة والنماذج",
    icon: Brain,
    activeClass:
      "data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-900/30",
  },
  {
    value: "billing",
    label: "الاشتراكات",
    description: "الباقات وحالة الدفع",
    icon: Crown,
    activeClass:
      "data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-900/30",
  },
  {
    value: "clarifications",
    label: "التوضيحات المعلقة",
    description: "مراجعة الحالات غير الواضحة",
    icon: AlertCircle,
    activeClass:
      "data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 dark:data-[state=active]:bg-orange-900/30",
  },
  {
    value: "whatsapp",
    label: "واتساب",
    description: "الخدمة والرسائل",
    icon: MessageCircle,
    activeClass:
      "data-[state=active]:bg-green-50 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-900/30",
  },
  {
    value: "ads",
    label: "الحملات الإعلانية",
    description: "الحملات والاستهداف",
    icon: Megaphone,
    activeClass:
      "data-[state=active]:bg-pink-50 data-[state=active]:text-pink-700 dark:data-[state=active]:bg-pink-900/30",
  },
  {
    value: "rules",
    label: "القاموس والقواعد",
    description: "قواعد التصنيف المتعلمة",
    icon: BookOpen,
    activeClass:
      "data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 dark:data-[state=active]:bg-teal-900/30",
  },
  {
    value: "raw-sms",
    label: "سجل SMS",
    description: "الرسائل الخام والمعالجة",
    icon: FileText,
    activeClass:
      "data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-900/30",
  },
  {
    value: "audit",
    label: "سجل الرقابة",
    description: "الجلسات والنشاط الإداري",
    icon: History,
    activeClass:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800",
  },
  {
    value: "notifications",
    label: "الإشعارات",
    description: "القوالب وسجل الإرسال",
    icon: Bell,
    activeClass:
      "data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700 dark:data-[state=active]:bg-sky-900/30",
  },
  {
    value: "settings",
    label: "الحدود والإعدادات",
    description: "الخطط والمفاتيح والحدود",
    icon: Settings2,
    activeClass:
      "data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800",
  },
] as const;

type AdminSection = (typeof ADMIN_SECTIONS)[number]["value"];

export default function Admin() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "user" | "moderator" | "admin"
  >("all");
  const [planFilter, setPlanFilter] = useState<
    "all" | "free" | "pro" | "ultra"
  >("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminSection>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);

  // Modal states for user-specific message popup
  const [messageUser, setMessageUser] = useState<any>(null);
  const [messageChannel, setMessageChannel] = useState<"whatsapp" | "email">(
    "whatsapp",
  );
  const [messageText, setMessageText] = useState("");

  const sendWhatsappMutation = trpc.adminWhatsapp.sendDirectMessage.useMutation(
    {
      onSuccess: (res) => {
        toast.success(res.message || "تم إرسال رسالة الواتساب بنجاح! 🎉");
        setMessageUser(null);
        setMessageText("");
      },
      onError: (err) => {
        toast.error(`فشل الإرسال: ${err.message}`);
      },
    },
  );

  const {
    stats,
    users,
    updateRole,
    updatePlan,
    deleteUser,
    revokeSession,
    voiceUsage,
  } = useAdmin({
    dashboard: activeTab === "overview" && user?.role === "admin",
    users: activeTab === "users",
    userFilters: {
      search: search.trim() || undefined,
      role: roleFilter === "all" ? undefined : roleFilter,
      plan: planFilter === "all" ? undefined : planFilter,
    },
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

  const aiCostQuery = trpc.admin.getAICostOverview.useQuery(
    { limit: 250 },
    { enabled: activeTab === "ai" && user?.role === "admin" },
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

  const filteredUsers = users.data?.users || [];

  const activeSection =
    ADMIN_SECTIONS.find((section) => section.value === activeTab) ??
    ADMIN_SECTIONS[0];
  const ActiveSectionIcon = activeSection.icon;

  const selectMobileSection = (section: AdminSection) => {
    setActiveTab(section);
    setMobileNavOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("admin-content")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950">
        <Card className="p-10 text-center max-w-md border-rose-100 shadow-xl shadow-rose-100/50">
          <ShieldAlert className="w-20 h-20 text-rose-500 mx-auto mb-6" />
          <h2 className="text-3xl font-black mb-3 text-slate-800">
            وصول غير مصرح
          </h2>
          <p className="text-slate-500">
            هذه المنطقة مخصصة لحسابات الإدارة العليا فقط.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="min-h-full min-h-screen-safe overflow-x-clip bg-gradient-to-br from-slate-50 to-indigo-50/50 pb-8 pb-safe font-sans dark:from-slate-950 dark:to-indigo-950/20 sm:pb-12"
      dir="rtl"
    >
      <SEOMeta path="/admin" title="لوحة التحكم الإدارية | SmartSpend" />

      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 border-b border-white/20 bg-white/90 pt-safe shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                to="/more"
                aria-label="العودة إلى المزيد"
                className="active-press flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              >
                <ArrowRight className="size-5" />
              </Link>
              <div className="bg-indigo-600 text-white p-2 rounded-lg">
                <Server className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                  مركز القيادة
                </h1>
                <p className="truncate text-[10px] font-mono uppercase tracking-widest text-slate-500">
                  SmartSpend OS
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 sm:gap-3">
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
                aria-label="تصدير البيانات"
                className="size-10 gap-2 bg-slate-800 p-0 hover:bg-slate-700 sm:h-9 sm:w-auto sm:px-3"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">تصدير</span>
              </Button>
            </div>
          </div>

          <div className="pb-3 lg:hidden">
            <button
              type="button"
              data-testid="admin-mobile-section-trigger"
              aria-haspopup="dialog"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              className="active-press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-start shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800/80"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
                <ActiveSectionIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">
                  {activeSection.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {activeSection.description}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                الأقسام
                <ChevronDown className="size-4" />
              </span>
            </button>
          </div>
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="bottom"
          dir="rtl"
          className="max-h-[82dvh] gap-0 rounded-t-[28px] border-slate-200 bg-white px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-950 lg:hidden"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-1 h-1.5 w-11 rounded-full bg-slate-300 dark:bg-slate-700"
          />
          <SheetHeader className="px-2 pb-3 pt-4 text-start">
            <SheetTitle className="text-lg font-black">
              أقسام لوحة الإدارة
            </SheetTitle>
            <SheetDescription>
              اختر القسم المطلوب؛ سيُغلق التنقل وتظهر أدواته مباشرة.
            </SheetDescription>
          </SheetHeader>
          <nav
            aria-label="أقسام لوحة الإدارة"
            className="hide-scrollbar grid min-h-0 auto-rows-max grid-cols-2 gap-2 overflow-y-auto overscroll-contain px-1 pb-2"
          >
            {ADMIN_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = section.value === activeTab;
              return (
                <button
                  key={section.value}
                  type="button"
                  data-testid={`admin-mobile-section-${section.value}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => selectMobileSection(section.value)}
                  className={`active-press flex h-auto min-h-[76px] min-w-0 items-center gap-2 rounded-2xl border p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm dark:border-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200"
                      : "border-slate-200 bg-slate-50/70 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100"
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-slate-600 shadow-xs dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-xs font-black leading-5">
                      {section.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div
        id="admin-content"
        className="mx-auto mt-4 min-w-0 max-w-[1400px] scroll-mt-36 px-3 sm:mt-8 sm:px-6 lg:scroll-mt-20 lg:px-8"
      >
        <Tabs
          dir="rtl"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AdminSection)}
          className="min-w-0 no-print"
        >
          <TabsList className="mb-8 hidden h-auto w-full max-w-full flex-wrap justify-start gap-1 rounded-2xl border border-white/50 bg-white/60 p-1.5 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/60 lg:flex">
            {ADMIN_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <TabsTrigger
                  key={section.value}
                  value={section.value}
                  className={`gap-2 rounded-xl px-3 py-2.5 transition-all sm:px-4 ${section.activeClass}`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {section.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="min-w-0 animate-in fade-in-50 duration-300 slide-in-from-bottom-2">
            {/* 1. Overview */}
            <TabsContent value="overview">
              {stats.isError && (
                <Card className="mb-6 border-destructive/30">
                  <CardContent className="py-4 text-sm text-destructive">
                    تعذّر تحميل إحصائيات اللوحة: {stats.error?.message}
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
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
                <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
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
                      عرض {filteredUsers.length} من{" "}
                      {users.data?.total ?? filteredUsers.length} حساب مسجل
                      بالنظام
                    </CardDescription>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto md:flex-wrap">
                    <div className="relative col-span-2 min-w-0 md:w-64 md:flex-1">
                      <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="بحث بالاسم، الإيميل، رقم الهاتف..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pe-10 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <Select
                      value={roleFilter}
                      onValueChange={(value) =>
                        setRoleFilter(value as typeof roleFilter)
                      }
                    >
                      <SelectTrigger className="w-full bg-white dark:bg-slate-950 md:w-32">
                        <SelectValue placeholder="الصلاحية" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل (الصلاحيات)</SelectItem>
                        <SelectItem value="user">مستخدم عادي</SelectItem>
                        <SelectItem value="moderator">مشرف</SelectItem>
                        <SelectItem value="admin">إدارة عليا</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={planFilter}
                      onValueChange={(value) =>
                        setPlanFilter(value as typeof planFilter)
                      }
                    >
                      <SelectTrigger className="w-full bg-white dark:bg-slate-950 md:w-32">
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

                <div className="space-y-3 p-3 md:hidden">
                  {filteredUsers.map((account) => (
                    <AdminUserMobileCard
                      key={`${account.userType}-${account.id}`}
                      user={account}
                      disabled={updateRole.isPending || updatePlan.isPending}
                      onRole={(role) =>
                        updateRole.mutate({
                          userId: account.id,
                          userType: account.userType,
                          role,
                        })
                      }
                      onPlan={(plan) =>
                        updatePlan.mutate({
                          userId: account.id,
                          userType: account.userType,
                          plan,
                        })
                      }
                      onProfile={() => {
                        setSelectedUser(account);
                        setShowProfile(true);
                      }}
                      onSessions={() => {
                        setSelectedUser(account);
                        setShowSessions(true);
                      }}
                      onMessage={() => {
                        setMessageUser(account);
                        setMessageChannel(
                          "phone" in account && account.phone
                            ? "whatsapp"
                            : "email",
                        );
                      }}
                      onDelete={() => setUserToDelete(account)}
                    />
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {users.isLoading
                        ? "جاري تحميل المستخدمين..."
                        : "لا يوجد مستخدمون يطابقون بحثك."}
                    </p>
                  )}
                </div>
                <div
                  className="hidden overflow-x-auto overscroll-x-contain md:block"
                  aria-label="جدول المستخدمين؛ اسحب أفقيًا لعرض كل الأعمدة"
                  tabIndex={0}
                >
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
                                    setMessageChannel(
                                      u.phone ? "whatsapp" : "email",
                                    );
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
                <div className="border-b border-white/20 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50 sm:p-6">
                  <CardTitle>مركز الدعم الفني والمساعدة</CardTitle>
                  <CardDescription>
                    متابعة والرد على استفسارات ومشكلات المستخدمين (
                    {ticketsQuery.data?.total ?? 0})
                  </CardDescription>
                </div>
                <div className="space-y-4 bg-slate-50/30 p-3 sm:p-6">
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

                <TabsContent value="ai" className="space-y-6">
                  <ApiKeyErrorsPanel />
                  <AiCommandCenter />
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
      <Dialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-sm rounded-3xl p-4 motion-reduce:animate-none sm:p-6"
          dir="rtl"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-full">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                حذف حساب المستخدم نهائياً؟
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                تحذير: سيتم حذف بيانات المستخدم{" "}
                <span className="font-bold text-rose-600">
                  "{userToDelete?.name}"
                </span>{" "}
                بالكامل بما في ذلك المصروفات والملف الذكي والجلسات. هذا الإجراء
                غير قابل للتراجع.
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
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-3xl p-0 overflow-hidden motion-reduce:animate-none"
          dir="rtl"
        >
          <DialogHeader className="border-b bg-slate-50 p-4 pe-10 text-start dark:bg-slate-900 sm:p-6 sm:pe-10">
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Activity className="w-5 h-5 shrink-0 text-indigo-500" />
              سجل الجلسات والأمان - {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
            {sessionsQuery.data?.map((s: any) => (
              <div
                key={s.id}
                className="flex flex-col items-start justify-between gap-3 p-4 bg-white dark:bg-slate-950 border dark:border-slate-800 rounded-xl shadow-sm sm:flex-row sm:items-center"
              >
                <div className="min-w-0 max-w-full">
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
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-2xl p-0 overflow-hidden max-h-[85dvh] motion-reduce:animate-none"
          dir="rtl"
        >
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
        <DialogContent className="motion-reduce:animate-none sm:max-w-md">
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
      <Dialog
        open={!!messageUser}
        onOpenChange={(open) => !open && setMessageUser(null)}
      >
        <DialogContent
          className="w-[calc(100%-1.5rem)] max-w-md p-4 overflow-hidden rounded-3xl motion-reduce:animate-none sm:p-6"
          dir="rtl"
        >
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
                  variant={
                    messageChannel === "whatsapp" ? "default" : "outline"
                  }
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
                <p className="text-xs text-rose-500 mt-1">
                  هذا الحساب لا يملك رقم هاتف مسجل
                </p>
              )}
              {!messageUser?.email && messageChannel === "email" && (
                <p className="text-xs text-rose-500 mt-1">
                  هذا الحساب لا يملك بريد إلكتروني مسجل
                </p>
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
                    toast.success(
                      "تم فتح عميل البريد الإلكتروني الخاص بك لإرسال الرسالة.",
                    );
                  }
                }}
                disabled={!messageText.trim() || sendWhatsappMutation.isPending}
                className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
              >
                {sendWhatsappMutation.isPending
                  ? "جاري الإرسال..."
                  : "إرسال الآن"}
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
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-2xl ${theme.bg} ${theme.text}`}>
            {icon}
          </div>
        </div>
        <p className="break-words text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight sm:text-3xl">
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
                        if (parseModel === "rule_engine") {
                          parseModel = null;
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

function AICostDashboard({ query }: { query: any }) {
  if (query.isLoading) {
    return (
      <div className="text-center py-8 text-sm text-slate-500">
        جاري تحميل بيانات التكلفة والاتصال...
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="text-center py-8 text-sm text-red-500 font-medium">
        فشل تحميل إحصائيات التكلفة:{" "}
        {query.error?.message || String(query.error)}
      </div>
    );
  }

  const data = query.data;
  if (!data || !data.totals) {
    return (
      <div className="text-center py-8 text-sm text-slate-500">
        لا توجد بيانات تكلفة متاحة حالياً.
      </div>
    );
  }

  const { totals, byChannel, byRoute, recent } = data;

  return (
    <div className="space-y-6">
      {/* 1. Totals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Brain className="w-5 h-5 text-indigo-500" />}
          label="إجمالي Tokens المستخدمة"
          value={totals.totalTokens.toLocaleString("ar-EG")}
          color="indigo"
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-pink-500" />}
          label="التكلفة التقريبية للـ AI"
          value={`${(totals.totalCostUnits / 1000).toFixed(3)} EGP`}
          color="pink"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-500" />}
          label="متوسط زمن الاستجابة"
          value={`${(totals.avgLatencyMs / 1000).toFixed(2)} ثانية`}
          color="amber"
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5 text-emerald-500" />}
          label="توفير الكاش (Cache Hit)"
          value={`${Math.round((totals.cacheHitRate ?? 0) * 100)}%`}
          color="emerald"
        />
      </div>

      {/* 2. Channels Breakdown & Route stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Channels */}
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              توزيع العمليات حسب القنوات (Channels)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-end">
              <thead className="text-muted-foreground border-b pb-2">
                <tr>
                  <th className="py-2 px-1 text-end">القناة</th>
                  <th className="py-2 px-1 text-end">العدد</th>
                  <th className="py-2 px-1 text-end">الـ Tokens</th>
                  <th className="py-2 px-1 text-end">متوسط الاستجابة</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byChannel).map(
                  ([channel, metrics]: [string, any]) => (
                    <tr
                      key={channel}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    >
                      <td className="py-2.5 px-1 font-semibold text-slate-800 dark:text-slate-200 text-end">
                        {channel === "whatsapp"
                          ? "واتساب"
                          : channel === "telegram"
                            ? "تليجرام"
                            : "ويب / تطبيق"}
                      </td>
                      <td className="py-2.5 px-1 text-end">{metrics.count}</td>
                      <td className="py-2.5 px-1 text-end">
                        {metrics.totalTokens.toLocaleString("ar-EG")}
                      </td>
                      <td className="py-2.5 px-1 text-end">
                        {(metrics.avgLatencyMs / 1000).toFixed(2)}s
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Routes */}
        <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-500" />
              الـ Routes الأكثر طلباً بالذكاء الاصطناعي
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-end">
              <thead className="text-muted-foreground border-b pb-2">
                <tr>
                  <th className="py-2 px-1 text-end">الـ Intent / Route</th>
                  <th className="py-2 px-1 text-end">العدد</th>
                  <th className="py-2 px-1 text-end">نسبة الـ Fallback</th>
                  <th className="py-2 px-1 text-end">متوسط الاستجابة</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byRoute)
                  .slice(0, 5)
                  .map(([route, metrics]: [string, any]) => (
                    <tr
                      key={route}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                    >
                      <td
                        className="py-2.5 px-1 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px] text-end"
                        title={route}
                      >
                        {route}
                      </td>
                      <td className="py-2.5 px-1 text-end">{metrics.count}</td>
                      <td className="py-2.5 px-1 text-end">
                        {Math.round(metrics.fallbackRate * 100)}%
                      </td>
                      <td className="py-2.5 px-1 text-end">
                        {(metrics.avgLatencyMs / 1000).toFixed(2)}s
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* 3. Recent cost events log */}
      <Card className="border-white/40 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            سجل تكلفة وموثوقية عمليات الـ AI الأخيرة
          </CardTitle>
          <CardDescription className="text-xs">
            آخر 15 عملية تمت مراقبتها وتحليل جودتها
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs text-end">
            <thead className="text-muted-foreground border-b pb-2">
              <tr>
                <th className="py-2 px-2 text-right">المسار / Intent</th>
                <th className="py-2 px-2 text-end">الموديل</th>
                <th className="py-2 px-2 text-end">نوع العميل</th>
                <th className="py-2 px-2 text-end">عدد الـ Tokens</th>
                <th className="py-2 px-2 text-end">الزمن (ثانية)</th>
                <th className="py-2 px-2 text-end">حالة الـ Cache</th>
                <th className="py-2 px-2 text-end">استدعاء بديل (Fallback)</th>
                <th className="py-2 px-2 text-end">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 15).map((event: any, i: number) => (
                <tr
                  key={event.id ?? i}
                  className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                >
                  <td className="py-2.5 px-2 text-right font-medium text-slate-700 dark:text-slate-300">
                    {event.route}
                  </td>
                  <td className="py-2.5 px-2 text-end">
                    <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      {event.model || "—"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-end">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${event.userType === "oauth" ? "bg-blue-500/10 text-blue-500" : "bg-teal-500/10 text-teal-500"}`}
                    >
                      {event.userType === "oauth" ? "OAuth" : "OTP محلي"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-end">{event.totalTokens}</td>
                  <td className="py-2.5 px-2 text-end">
                    {(event.latencyMs / 1000).toFixed(2)}s
                  </td>
                  <td className="py-2.5 px-2 text-end">
                    {event.cacheHit === true ? (
                      <span className="text-emerald-500 font-semibold">
                        Hit 🎯
                      </span>
                    ) : event.cacheHit === false ? (
                      <span className="text-slate-400">Miss ❌</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-end">
                    {event.fallback ? (
                      <span className="text-amber-500 font-semibold">
                        نعم ⚠️
                      </span>
                    ) : (
                      <span className="text-slate-400">لا</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-400 text-end">
                    {event.createdAt
                      ? new Date(event.createdAt).toLocaleTimeString("ar-EG", {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
