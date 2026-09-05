import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { trpc } from "../providers/trpc";
import { SEOMeta } from "../components/seo/SEOMeta";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { SmartProfileSettings } from "@/components/profile/SmartProfileSettings";
import { SmartProfileView } from "@/components/profile/SmartProfileView";
import { PasskeySettings } from "@/components/auth/PasskeySettings";
import { PeopleSettingsView } from "@/components/settings/PeopleSettingsView";
import { BusinessSettingsView } from "@/components/settings/BusinessSettingsView";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  User,
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Moon,
  Sun,
  Monitor,
  Briefcase,
  Check,
  ShieldCheck,
  Sparkles,
  Users,
  Store,
} from "lucide-react";

type SettingsView =
  | "main"
  | "profile"
  | "notifications"
  | "passkeys"
  | "theme"
  | "ai_report"
  | "people"
  | "business";

const SETTINGS_VIEW_PATHS: Record<SettingsView, string> = {
  main: "/settings",
  profile: "/settings/profile",
  notifications: "/settings/notifications",
  passkeys: "/settings/security",
  theme: "/settings/appearance",
  ai_report: "/settings/ai-report",
  people: "/settings/people",
  business: "/settings/business",
};

function resolveSettingsView(
  pathname: string,
  legacyTab: string | null,
): SettingsView {
  const pathEntry = Object.entries(SETTINGS_VIEW_PATHS).find(
    ([view, path]) => view !== "main" && pathname === path,
  );
  if (pathEntry) return pathEntry[0] as SettingsView;

  if (
    legacyTab === "passkeys" ||
    legacyTab === "security" ||
    legacyTab === "biometrics"
  )
    return "passkeys";
  if (legacyTab === "notifications") return "notifications";
  if (legacyTab === "profile") return "profile";
  if (legacyTab === "theme") return "theme";
  if (legacyTab === "ai_report") return "ai_report";
  if (legacyTab === "people") return "people";
  if (legacyTab === "business") return "business";
  return "main";
}

interface SettingsMenuItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick: () => void;
  badge?: React.ReactNode;
  iconClass?: string;
  danger?: boolean;
}

function SettingsMenuItem({
  icon,
  title,
  description,
  onClick,
  badge,
  iconClass = "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
  danger = false,
}: SettingsMenuItemProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border cursor-pointer text-end select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors min-h-[76px] ${
        danger
          ? "border-rose-200 dark:border-rose-950/40 bg-rose-50/10 dark:bg-rose-950/5 hover:bg-rose-50/20 dark:hover:bg-rose-950/10 text-rose-600 dark:text-rose-400"
          : "border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/30 backdrop-blur-md hover:bg-slate-100/50 dark:hover:bg-slate-900/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${iconClass}`}
        >
          {icon}
        </div>
        <div className="text-end">
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            {title}
          </h4>
          {description && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        {!danger && <ChevronLeft className="w-4 h-4 text-slate-400" />}
      </div>
    </motion.button>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const legacyTab = new URLSearchParams(location.search).get("tab");
  const currentView = resolveSettingsView(location.pathname, legacyTab);
  const openView = (view: Exclude<SettingsView, "main">) =>
    navigate(SETTINGS_VIEW_PATHS[view]);
  const closeView = () => navigate(SETTINGS_VIEW_PATHS.main);

  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const profileQuery = trpc.profile.getSmartProfile.useQuery();
  const trpcContext = trpc.useContext();
  const updateProfileMut = trpc.profile.updateSmartProfile.useMutation();

  const isProfileComplete = profileQuery.data?.profileCompleted;

  const { isSupported, isSubscribed, subscribeToPush } = usePushNotifications();

  const avatar = user?.avatar || "";

  const completionScore = (() => {
    if (!profileQuery.data) return 0;
    const financial = profileQuery.data.financialInfo as any;
    const lifestyle = profileQuery.data.lifestyleInfo as any;
    const basic = profileQuery.data.basicInfo as any;

    const checks = [
      financial?.averageMonthlyIncome,
      financial?.primaryGoal,
      lifestyle?.livingSituation,
      financial?.hasDebt !== undefined,
      basic?.profession,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  const rtlSubViewVariants: Variants = {
    initial: (isSubView: boolean) => ({
      x: isSubView ? "-100%" : "25%",
      opacity: 0,
      scale: isSubView ? 1 : 0.96,
    }),
    animate: {
      x: "0%",
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 380,
        damping: 34,
        mass: 0.8,
      },
    },
    exit: (isSubView: boolean) => ({
      x: isSubView ? "25%" : "-100%",
      opacity: 0,
      scale: isSubView ? 0.96 : 1,
      transition: {
        duration: 0.25,
        ease: [0.32, 0.72, 0, 1],
      },
    }),
  };

  // Reusable header for sub-views
  const SubViewHeader = ({
    title,
    onBack,
  }: {
    title: string;
    onBack: () => void;
  }) => (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="tap-target active-press flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
        aria-label="رجوع"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          {title}
        </h1>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen bg-background px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-8"
      dir="rtl"
    >
      <SEOMeta path="/settings" title="الإعدادات الذكية - SmartSpend AI" />

      <div className="max-w-4xl mx-auto">
        <AnimatePresence
          initial={false}
          mode="popLayout"
          custom={currentView !== "main"}
        >
          {currentView === "main" && (
            <motion.div
              key="main"
              custom={false}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              {/* Header */}
              <div className="text-end">
                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  الإعدادات
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  تفضيلات حسابك، إشعارات الموبايل والمظهر
                </p>
              </div>

              {/* User Profile Summary Card */}
              <motion.div
                onClick={() => {
                  setIsEditingProfile(false);
                  openView("profile");
                }}
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.99 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="flex items-center justify-between p-4 sm:p-5 rounded-3xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800 shadow-xl cursor-pointer relative group overflow-hidden"
              >
                {/* Glow decor */}
                <div className="absolute top-0 end-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute bottom-0 start-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-4 relative z-10">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Profile"
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-emerald-400 shadow-md"
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-700">
                      <User className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                    </div>
                  )}
                  <div className="text-end">
                    <h3 className="font-extrabold text-base sm:text-lg">
                      {user?.name || "مستخدم SmartSpend"}
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-1 font-medium">
                      <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                      {(profileQuery.data?.basicInfo as any)?.profession ||
                        "لم يتم تحديد المهنة"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 relative z-10">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-black bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                      {completionScore}% مكتمل
                    </span>
                    <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 tracking-wider">
                      {user?.plan === "pro"
                        ? "PRO"
                        : user?.plan === "ultra"
                          ? "ULTRA"
                          : "FREE"}
                    </span>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                </div>
              </motion.div>

              {/* Menu Groups */}
              <div className="space-y-5 text-end">
                {/* Group 1: Account Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2">
                    إدارة الحساب
                  </h4>
                  <div className="grid gap-2">
                    <SettingsMenuItem
                      icon={<Fingerprint className="w-5 h-5" />}
                      title="الأمان والدخول بالبصمة"
                      description="تفعيل الدخول السريع ببصمة الوجه أو الأصبع"
                      onClick={() => openView("passkeys")}
                    />
                  </div>
                </div>

                {/* Group 1.5: Relationship Management */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2">
                    إدارة العلاقات
                  </h4>
                  <div className="grid gap-2">
                    <SettingsMenuItem
                      icon={<Users className="w-5 h-5" />}
                      title="الأشخاص والعلاقات"
                      description="إدارة الأسماء، العلاقات، والدمج"
                      onClick={() => openView("people")}
                    />
                    <SettingsMenuItem
                      icon={<Store className="w-5 h-5" />}
                      title="مشروعك التجاري"
                      description="فئات مخصصة وتصنيف تلقائي للمشروع"
                      onClick={() => openView("business")}
                    />
                  </div>
                </div>

                {/* Group 2: App Preferences */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2">
                    تفضيلات التطبيق
                  </h4>
                  <div className="grid gap-2">
                    <SettingsMenuItem
                      icon={<BellRing className="w-5 h-5" />}
                      title="إشعارات المتصفح والموبايل"
                      description="التحكم بتنبيهات السقف المالي الفورية"
                      onClick={() => openView("notifications")}
                      badge={
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${isSubscribed ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"}`}
                        >
                          {isSubscribed ? "مفعلة" : "غير مفعلة"}
                        </span>
                      }
                    />
                    <SettingsMenuItem
                      icon={
                        theme === "dark" ? (
                          <Moon className="w-5 h-5" />
                        ) : theme === "light" ? (
                          <Sun className="w-5 h-5" />
                        ) : (
                          <Monitor className="w-5 h-5" />
                        )
                      }
                      title="مظهر التطبيق"
                      description="التحويل بين المظهر الفاتح والداكن والتلقائي"
                      onClick={() => openView("theme")}
                      badge={
                        <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50">
                          {theme === "dark"
                            ? "داكن"
                            : theme === "light"
                              ? "فاتح"
                              : "تلقائي"}
                        </span>
                      }
                    />
                    <SettingsMenuItem
                      icon={<Sparkles className="w-5 h-5" />}
                      title="التحليل الشهري بالذكاء الاصطناعي"
                      description="إعدادات تقرير الواتساب وموعد الإرسال"
                      onClick={() => openView("ai_report")}
                      iconClass="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Sub-view: Profile */}
          {currentView === "profile" && (
            <motion.div
              key="profile"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              {isEditingProfile ? (
                <div className="space-y-4">
                  <SmartProfileSettings
                    onCancel={() => setIsEditingProfile(false)}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <SmartProfileView
                    onEdit={() => setIsEditingProfile(true)}
                    onBack={closeView}
                  />
                </div>
              )}
            </motion.div>
          )}

          {/* Sub-view: Passkeys */}
          {currentView === "passkeys" && (
            <motion.div
              key="passkeys"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4 will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <SubViewHeader title="الأمان والدخول" onBack={closeView} />
              <PasskeySettings />
            </motion.div>
          )}

          {/* Sub-view: Notifications */}
          {currentView === "notifications" && (
            <motion.div
              key="notifications"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4 will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <SubViewHeader title="إعدادات الإشعارات" onBack={closeView} />
              <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl rounded-3xl overflow-hidden">
                <CardHeader className="py-5 px-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10">
                  <CardTitle className="text-lg flex items-center gap-2 font-black">
                    <BellRing
                      className="w-5 h-5 text-indigo-500 animate-bounce"
                      style={{ animationDuration: "3s" }}
                    />
                    إشعارات المتصفح والموبايل
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    فعل الإشعارات لتتلقى تنبيهات هامة من النظام على هاتفك عند
                    تجاوز سقف الميزانية.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="text-end">
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      إشعارات النظام الفورية
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 leading-relaxed">
                      سيتم إرسال الإشعارات مباشرة إلى هذا الجهاز. تأكد من إعطاء
                      الصلاحية عند طلب المتصفح.
                    </p>
                  </div>
                  {!isSupported ? (
                    <Button variant="outline" className="rounded-xl" disabled>
                      غير مدعوم في متصفحك
                    </Button>
                  ) : isSubscribed ? (
                    <Button
                      variant="secondary"
                      className="gap-2 rounded-xl text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100 cursor-default font-bold h-11"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      مفعلة مسبقاً بنجاح
                    </Button>
                  ) : (
                    <Button
                      onClick={subscribeToPush}
                      className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-6 shadow-lg shadow-indigo-500/10"
                    >
                      <BellRing className="w-4 h-4" />
                      تفعيل الإشعارات الآن
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Sub-view: Theme */}
          {currentView === "theme" && (
            <motion.div
              key="theme"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4 will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <SubViewHeader title="مظهر التطبيق" onBack={closeView} />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card: Light */}
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  aria-pressed={theme === "light"}
                  className={`flex flex-col items-center gap-3 p-6 rounded-3xl border cursor-pointer transition-all duration-300 active-press shadow-sm bg-white dark:bg-slate-950 ${theme === "light" ? "border-indigo-500 ring-2 ring-indigo-500/10 scale-102" : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30"}`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${theme === "light" ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 dark:bg-slate-900 text-slate-500"}`}
                  >
                    <Sun className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      فاتح (Light)
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      مناسب للإضاءة القوية
                    </p>
                  </div>
                  {theme === "light" && (
                    <Check className="w-4 h-4 text-indigo-500" />
                  )}
                </button>

                {/* Card: Dark */}
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  aria-pressed={theme === "dark"}
                  className={`flex flex-col items-center gap-3 p-6 rounded-3xl border cursor-pointer transition-all duration-300 active-press shadow-sm bg-white dark:bg-slate-950 ${theme === "dark" ? "border-indigo-500 ring-2 ring-indigo-500/10 scale-102" : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30"}`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${theme === "dark" ? "bg-indigo-950 text-indigo-400" : "bg-slate-100 dark:bg-slate-900 text-slate-500"}`}
                  >
                    <Moon className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      داكن (Dark)
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      مريح للعين بالليل
                    </p>
                  </div>
                  {theme === "dark" && (
                    <Check className="w-4 h-4 text-indigo-400" />
                  )}
                </button>

                {/* Card: System */}
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  aria-pressed={theme === "system"}
                  className={`flex flex-col items-center gap-3 p-6 rounded-3xl border cursor-pointer transition-all duration-300 active-press shadow-sm bg-white dark:bg-slate-950 ${theme === "system" ? "border-indigo-500 ring-2 ring-indigo-500/10 scale-102" : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30"}`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${theme === "system" ? "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300" : "bg-slate-100 dark:bg-slate-900 text-slate-500"}`}
                  >
                    <Monitor className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      تلقائي (System)
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      يتماشى مع نظام جهازك
                    </p>
                  </div>
                  {theme === "system" && (
                    <Check className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {currentView === "ai_report" && (
            <motion.div
              key="ai_report"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6 will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <SubViewHeader
                title="إعدادات التحليل والواتساب"
                onBack={closeView}
              />

              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden glass-card">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-500" />
                    التقرير الذكي والواتساب
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    تحكم في كيفية وموعد استلام التقرير الشهري. يتم إرسال التقرير
                    حصرياً للمشتركين بخطة Pro.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-6">
                  {/* Whatsapp Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        إرسال التقرير عبر الواتساب
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        استلام تحليل مصاريفك شهرياً على الواتس
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={
                          profileQuery.data?.preferences
                            ?.whatsappReportsEnabled !== false
                        }
                        onChange={(e) => {
                          trpcContext.profile.getSmartProfile.setData(
                            undefined,
                            (old: any) => {
                              if (!old) return old;
                              return {
                                ...old,
                                preferences: {
                                  ...old.preferences,
                                  whatsappReportsEnabled: e.target.checked,
                                },
                              };
                            },
                          );
                          updateProfileMut.mutate({
                            preferences: {
                              ...profileQuery.data?.preferences,
                              whatsappReportsEnabled: e.target.checked,
                            },
                          });
                        }}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  <div className="h-px bg-slate-100 dark:bg-slate-800/60" />

                  {/* Timing Option */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
                      موعد استلام التقرير
                    </h4>
                    <div className="grid gap-3">
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <input
                          type="radio"
                          name="report_timing"
                          value="end_of_month"
                          className="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 focus:ring-emerald-500"
                          checked={
                            profileQuery.data?.preferences?.reportTiming !==
                            "salary_day"
                          }
                          onChange={() => {
                            trpcContext.profile.getSmartProfile.setData(
                              undefined,
                              (old: any) => {
                                if (!old) return old;
                                return {
                                  ...old,
                                  preferences: {
                                    ...old.preferences,
                                    reportTiming: "end_of_month",
                                  },
                                };
                              },
                            );
                            updateProfileMut.mutate({
                              preferences: {
                                ...profileQuery.data?.preferences,
                                reportTiming: "end_of_month",
                              },
                            });
                          }}
                        />
                        <div>
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                            نهاية الشهر الميلادي
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            يوم 1 من كل شهر جديد
                          </span>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <input
                          type="radio"
                          name="report_timing"
                          value="salary_day"
                          className="w-4 h-4 text-emerald-600 bg-slate-100 border-slate-300 focus:ring-emerald-500"
                          checked={
                            profileQuery.data?.preferences?.reportTiming ===
                            "salary_day"
                          }
                          onChange={() => {
                            trpcContext.profile.getSmartProfile.setData(
                              undefined,
                              (old: any) => {
                                if (!old) return old;
                                return {
                                  ...old,
                                  preferences: {
                                    ...old.preferences,
                                    reportTiming: "salary_day",
                                  },
                                };
                              },
                            );
                            updateProfileMut.mutate({
                              preferences: {
                                ...profileQuery.data?.preferences,
                                reportTiming: "salary_day",
                              },
                            });
                          }}
                        />
                        <div>
                          <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                            يوم استلام الراتب
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            يبدأ التحليل مع دورة راتبك (حسب ما حددت في ملفك)
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Sub-view: People */}
          {currentView === "people" && (
            <motion.div
              key="people"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <PeopleSettingsView onBack={closeView} />
            </motion.div>
          )}

          {/* Sub-view: Business */}
          {currentView === "business" && (
            <motion.div
              key="business"
              custom={true}
              variants={rtlSubViewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="will-change-transform transform-gpu"
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <BusinessSettingsView onBack={closeView} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
