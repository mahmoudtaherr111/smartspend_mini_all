import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Briefcase,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  Gauge,
  LogOut,
  Palette,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";

const sections = [
  {
    title: "الحساب والبيانات",
    items: [
      {
        href: "/settings/profile",
        label: "الملف الشخصي",
        description: "بياناتك وملفك المالي الذكي",
        icon: UserRound,
      },
      {
        href: "/settings/people",
        label: "الأشخاص والديون",
        description: "إدارة جهات الاتصال، الديون، والسلف",
        icon: Users,
      },
      {
        href: "/settings/business",
        label: "النشاط التجاري",
        description: "إدارة حسابك التجاري وفصل مصاريف العمل",
        icon: Briefcase,
      },
    ],
  },
  {
    title: "التفضيلات والمظهر",
    items: [
      {
        href: "/settings/appearance",
        label: "مظهر التطبيق",
        description: "الوضع الفاتح والداكن ومظهر الواجهة",
        icon: Palette,
      },
      {
        href: "/settings/notifications",
        label: "الإشعارات والتنبيهات",
        description: "التحكم في التنبيهات والتذكيرات المالية",
        icon: Bell,
      },
      {
        href: "/settings/ai-report",
        label: "تقرير الذكاء الاصطناعي وواتساب",
        description: "التقارير الدورية وتنبيهات واتساب الذكية",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "الخدمات",
    items: [
      {
        href: "/pro",
        label: "الخطة والاشتراك",
        description: "راجع خطتك ومزايا SmartSpend",
        icon: CreditCard,
      },
      {
        href: "/bank-sync",
        label: "الربط البنكي",
        description: "استيراد العمليات بأمان من هاتفك",
        icon: Smartphone,
      },
      {
        href: "/support",
        label: "المساعدة والدعم",
        description: "الأسئلة الشائعة والتواصل معنا",
        icon: CircleHelp,
      },
    ],
  },
];

function preloadDestination(href: string) {
  if (href === "/admin") return import("@/pages/Admin");
  if (href === "/bank-sync") return import("@/pages/BankSyncPage");
  if (href === "/pro") return import("@/pages/Pro");
  if (href === "/support") return import("@/pages/Support");
  if (href.startsWith("/settings")) return import("@/pages/Settings");
  return Promise.resolve();
}

/** How many entries were written offline and are still waiting to be sent. */
function countUnsentOffline(): number {
  const count = (key: string) => {
    try {
      const items: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(items) ? items.length : 0;
    } catch {
      return 0;
    }
  };
  return count("smartspend_offline_texts") + count("smartspend_offline_manual");
}

export default function More() {
  const { user, isAdmin, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  // Logging out clears the offline queue (it belongs to this account); say so first.
  const unsentCount = logoutOpen ? countUnsentOffline() : 0;
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const confirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-5 dark:bg-slate-950/40 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">المزيد</h1>
          <p className="text-sm text-muted-foreground">
            حسابك وخدمات SmartSpend في مكان واحد
          </p>
        </header>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold" dir="auto">
              <bdi>{user?.name || "مستخدم SmartSpend"}</bdi>
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              <bdi>{user?.email || user?.phone || "حساب مسجل"}</bdi>
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
            {user?.plan === "ultra"
              ? "Ultra"
              : user?.plan === "pro"
                ? "Pro"
                : "مجاني"}
          </span>
        </div>

        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="px-1 text-xs font-bold text-muted-foreground">
              {section.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onPointerEnter={() => void preloadDestination(item.href)}
                    onFocus={() => void preloadDestination(item.href)}
                    className={`active-press flex min-h-[72px] items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 ${
                      index > 0
                        ? "border-t border-slate-200/70 dark:border-slate-800"
                        : ""
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section aria-labelledby="security-system-title" className="space-y-2">
          <h2
            id="security-system-title"
            className="px-1 text-xs font-bold text-muted-foreground"
          >
            الأمان والنظام
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <Link
              to="/settings/security"
              onPointerEnter={() => void preloadDestination("/settings/security")}
              onFocus={() => void preloadDestination("/settings/security")}
              className="active-press flex min-h-[72px] items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  الأمان والدخول بالبصمة
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  البصمة ومفاتيح المرور وقفل التطبيق
                </span>
              </span>
              <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                data-testid="mobile-admin-link"
                onPointerEnter={() => void preloadDestination("/admin")}
                onFocus={() => void preloadDestination("/admin")}
                className="active-press flex min-h-[72px] items-center gap-3 px-4 py-3 border-t border-slate-200/70 dark:border-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Gauge className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-amber-700 dark:text-amber-400">
                    لوحة الإدارة
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    المستخدمون والدعم وإعدادات النظام
                  </span>
                </span>
                <ChevronLeft className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              </Link>
            )}

            <div className="border-t border-slate-200/70 dark:border-slate-800 p-2">
              <AdaptiveDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                <AdaptiveDialogTrigger asChild>
                  <button
                    type="button"
                    className="active-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-bold text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    تسجيل الخروج
                  </button>
                </AdaptiveDialogTrigger>
                <AdaptiveDialogContent>
                  <AdaptiveDialogHeader>
                    <AdaptiveDialogTitle>تسجيل الخروج؟</AdaptiveDialogTitle>
                    <AdaptiveDialogDescription>
                      هتحتاج تسجل دخولك مرة تانية للوصول لبياناتك على الجهاز ده.
                    </AdaptiveDialogDescription>
                    {unsentCount > 0 && (
                      <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        عندك {unsentCount} تسجيل اتكتب من غير نت ولسه ماتبعتش. لو خرجت دلوقتي هيتمسحوا من الجهاز ده؛
                        وصّل النت واستنى لما يتبعتوا الأول.
                      </p>
                    )}
                  </AdaptiveDialogHeader>
                  <AdaptiveDialogFooter>
                    <AdaptiveDialogClose asChild>
                      <Button variant="outline" disabled={isLoggingOut}>
                        إلغاء
                      </Button>
                    </AdaptiveDialogClose>
                    <Button
                      variant="destructive"
                      disabled={isLoggingOut}
                      onClick={() => void confirmLogout()}
                    >
                      {isLoggingOut ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
                    </Button>
                  </AdaptiveDialogFooter>
                </AdaptiveDialogContent>
              </AdaptiveDialog>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
