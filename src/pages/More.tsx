import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
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
    title: "الحساب والتفضيلات",
    items: [
      {
        href: "/settings/profile",
        label: "الملف الشخصي",
        description: "بياناتك وملفك المالي الذكي",
        icon: UserRound,
      },
      {
        href: "/settings",
        label: "الإعدادات",
        description: "الأمان والإشعارات والمظهر",
        icon: Settings,
      },
      {
        href: "/settings/security",
        label: "الأمان والدخول",
        description: "البصمة ومفاتيح المرور وقفل التطبيق",
        icon: ShieldCheck,
      },
      {
        href: "/settings/notifications",
        label: "الإشعارات",
        description: "تحكم في التنبيهات والتذكيرات",
        icon: Bell,
      },
    ],
  },
  {
    title: "الخدمات",
    items: [
      {
        href: "/bank-sync",
        label: "الربط البنكي",
        description: "استيراد العمليات بأمان من هاتفك",
        icon: Smartphone,
      },
      {
        href: "/pro",
        label: "الخطة والاشتراك",
        description: "راجع خطتك ومزايا SmartSpend",
        icon: CreditCard,
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

export default function More() {
  const { user, isAdmin, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
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

        {isAdmin && (
          <section aria-labelledby="admin-section-title" className="space-y-2">
            <h2
              id="admin-section-title"
              className="px-1 text-xs font-bold text-amber-700 dark:text-amber-400"
            >
              الإدارة
            </h2>
            <div className="overflow-hidden rounded-2xl border border-amber-200/80 bg-white shadow-sm dark:border-amber-900/60 dark:bg-slate-900/70">
              <Link
                to="/admin"
                data-testid="mobile-admin-link"
                onPointerEnter={() => void preloadDestination("/admin")}
                onFocus={() => void preloadDestination("/admin")}
                className="active-press flex min-h-[76px] items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Gauge className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">لوحة الإدارة</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    المستخدمون والدعم وإعدادات النظام
                  </span>
                </span>
                <ChevronLeft className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              </Link>
            </div>
          </section>
        )}

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

        <section aria-label="الجلسة" className="pb-2">
          <AdaptiveDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
            <AdaptiveDialogTrigger asChild>
              <button
                type="button"
                className="active-press flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm font-bold text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400"
              >
                <LogOut className="h-5 w-5" />
                تسجيل الخروج
              </button>
            </AdaptiveDialogTrigger>
            <AdaptiveDialogContent>
              <AdaptiveDialogHeader>
                <AdaptiveDialogTitle>تسجيل الخروج؟</AdaptiveDialogTitle>
                <AdaptiveDialogDescription>
                  هتحتاج تسجل دخولك مرة تانية للوصول لبياناتك على الجهاز ده.
                </AdaptiveDialogDescription>
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
        </section>
      </div>
    </div>
  );
}
