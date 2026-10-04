import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Gauge,
  LogOut,
  ListChecks,
  Palette,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ExportExpensesCard } from "@/components/expenses/ExportExpensesCard";
import { useLanguage } from "@/i18n/context";
import type { MessageKey } from "@/i18n/ar";
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

interface MoreItem {
  href: string;
  labelKey: MessageKey;
  descKey: MessageKey;
  icon: typeof UserRound;
}

interface MoreSection {
  titleKey: MessageKey;
  items: MoreItem[];
}

const sections: MoreSection[] = [
  {
    titleKey: "more.section.account",
    items: [
      {
        href: "/settings/profile",
        labelKey: "more.item.profile",
        descKey: "more.item.profileDesc",
        icon: UserRound,
      },
      {
        href: "/settings/people",
        labelKey: "more.item.people",
        descKey: "more.item.peopleDesc",
        icon: Users,
      },
      {
        href: "/settings/business",
        labelKey: "more.item.business",
        descKey: "more.item.businessDesc",
        icon: Briefcase,
      },
    ],
  },
  {
    titleKey: "more.section.preferences",
    items: [
      {
        href: "/settings/appearance",
        labelKey: "more.item.appearance",
        descKey: "more.item.appearanceDesc",
        icon: Palette,
      },
      {
        href: "/settings/notifications",
        labelKey: "more.item.notifications",
        descKey: "more.item.notificationsDesc",
        icon: Bell,
      },
      {
        href: "/settings/ai-report",
        labelKey: "more.item.aiReport",
        descKey: "more.item.aiReportDesc",
        icon: Sparkles,
      },
    ],
  },
  {
    titleKey: "more.section.services",
    items: [
      {
        href: "/pro",
        labelKey: "more.item.pro",
        descKey: "more.item.proDesc",
        icon: CreditCard,
      },
      {
        href: "/plan",
        labelKey: "more.item.plan",
        descKey: "more.item.planDesc",
        icon: ListChecks,
      },
      {
        href: "/bank-sync",
        labelKey: "more.item.bankSync",
        descKey: "more.item.bankSyncDesc",
        icon: Smartphone,
      },
      {
        href: "/support",
        labelKey: "more.item.support",
        descKey: "more.item.supportDesc",
        icon: CircleHelp,
      },
    ],
  },
];

function preloadDestination(href: string) {
  if (href === "/admin") return import("@/pages/Admin");
  if (href === "/bank-sync") return import("@/pages/BankSyncPage");
  if (href === "/plan") return import("@/pages/PlanPage");
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
  const { dir, t } = useLanguage();
  const ForwardChevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const [logoutOpen, setLogoutOpen] = useState(false);
  // Logging out clears the offline queue (it belongs to this account); say so first.
  const unsentCount = logoutOpen ? countUnsentOffline() : 0;
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);

  const confirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-5 dark:bg-slate-950/40 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">{t("more.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("more.subtitle")}
          </p>
        </header>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold" dir="auto">
              <bdi>{user?.name || t("more.defaultUserName")}</bdi>
            </p>
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              <bdi>{user?.email || user?.phone || t("more.defaultUserAccount")}</bdi>
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
            {user?.plan === "ultra"
              ? t("more.plan.ultra")
              : user?.plan === "pro"
                ? t("more.plan.pro")
                : t("more.plan.free")}
          </span>
        </div>

        {sections.map((section) => (
          <section key={section.titleKey} className="space-y-2">
            <h2 className="px-1 text-xs font-bold text-muted-foreground">
              {t(section.titleKey)}
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
                        {t(item.labelKey)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t(item.descKey)}
                      </span>
                    </span>
                    <ForwardChevron className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <ExportExpensesCard />

        <section aria-labelledby="security-system-title" className="space-y-2">
          <h2
            id="security-system-title"
            className="px-1 text-xs font-bold text-muted-foreground"
          >
            {t("more.section.security")}
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
                  {t("more.item.security")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("more.item.securityDesc")}
                </span>
              </span>
              <ForwardChevron className="h-5 w-5 shrink-0 text-muted-foreground" />
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
                    {t("more.item.admin")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t("more.item.adminDesc")}
                  </span>
                </span>
                <ForwardChevron className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              </Link>
            )}

            <div className="border-t border-slate-200/70 dark:border-slate-800 p-2">
              <AdaptiveDialog
                open={logoutOpen}
                onOpenChange={(open) => {
                  if (!isLoggingOut) setLogoutOpen(open);
                }}
              >
                <AdaptiveDialogTrigger asChild>
                  <button
                    type="button"
                    className="active-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-bold text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("more.logout.button")}
                  </button>
                </AdaptiveDialogTrigger>
                <AdaptiveDialogContent
                  onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    cancelLogoutRef.current?.focus();
                  }}
                >
                  <AdaptiveDialogHeader>
                    <AdaptiveDialogTitle>{t("more.logout.title")}</AdaptiveDialogTitle>
                    <AdaptiveDialogDescription>
                      {t("more.logout.description")}
                    </AdaptiveDialogDescription>
                    {unsentCount > 0 && (
                      <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        {t("more.logout.unsentWarning", { count: unsentCount })}
                      </p>
                    )}
                  </AdaptiveDialogHeader>
                  <AdaptiveDialogFooter>
                    <AdaptiveDialogClose asChild>
                      <Button ref={cancelLogoutRef} variant="outline" disabled={isLoggingOut}>
                        {t("more.logout.cancel")}
                      </Button>
                    </AdaptiveDialogClose>
                    <Button
                      variant="destructive"
                      disabled={isLoggingOut}
                      onClick={() => void confirmLogout()}
                    >
                      {isLoggingOut ? t("more.logout.loading") : t("more.logout.confirm")}
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
