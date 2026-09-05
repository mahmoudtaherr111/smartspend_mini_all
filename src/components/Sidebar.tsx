import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsFetching } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Calendar,
  Settings,
  Shield,
  HelpCircle,
  LogOut,
  Menu,
  User,
  X,
  ChevronLeft,
  Crown,
  Sparkles,
  Sun,
  Moon,
  Smartphone,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
const darkModeLogo = "/photos/dark_mode_logo-removebg-preview.png";
const whiteModeLogo = "/photos/white_mode_logo-removebg-preview.png";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "الرئيسية", href: "/dashboard" },
  { icon: BarChart3, label: "إحصائيات", href: "/dashboard?tab=stats" },
  { icon: Sparkles, label: "مركز AI", href: "/ai" },
  { icon: Calendar, label: "التقويم", href: "/dashboard?tab=calendar" },
];

const bottomItems = [
  { icon: HelpCircle, label: "الدعم", href: "/support" },
  { icon: Settings, label: "الإعدادات", href: "/settings" },
];

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { user, isAdmin, isPro, hasUltraAccess, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const isFetching = useIsFetching();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000] lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed start-0 top-0 h-dvh max-h-screen z-[100001] flex flex-col transition-all duration-300 ease-out",
          "bg-slate-900 dark:bg-slate-950",
          "border-e border-white/10 shadow-2xl overflow-hidden",
          isOpen
            ? "w-72 translate-x-0"
            : "w-72 -translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0",
        )}
      >
        {/* Pinned Header */}
        <div className="shrink-0 p-4 pt-safe border-b border-white/10 space-y-3 bg-slate-900/80 dark:bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 transition-all duration-200">
              <img
                src={whiteModeLogo}
                alt="SmartSpend"
                className="h-10 sm:h-12 w-auto object-contain block dark:hidden no-drag pointer-events-none select-none"
              />
              <img
                src={darkModeLogo}
                alt="SmartSpend"
                className="h-10 sm:h-12 w-auto object-contain hidden dark:block no-drag pointer-events-none select-none"
              />
              {isPro && (
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                  <Crown className="w-3 h-3" /> PRO
                </span>
              )}
              {isFetching > 0 && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  مزامنة...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-white/70 hover:text-white hover:bg-white/10 h-8 w-8 rounded-lg"
                aria-label="تبديل المظهر"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="text-white/70 hover:text-white hover:bg-white/10 lg:hidden h-8 w-8 rounded-lg"
                aria-label="إغلاق القائمة"
              >
                {isOpen ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* User info Card */}
          {user && (
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-xs truncate">
                  {user.name}
                </p>
                <p className="text-white/50 text-[10px] truncate">
                  {user.email || user.phone || "مستخدم مسجل"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-emerald-400 font-bold text-[9px] bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {user.plan === "ultra"
                    ? "ULTRA"
                    : user.plan === "pro"
                      ? "PRO"
                      : "مجاني"}
                </span>
                {(user as any).currentStreak > 0 && (
                  <span className="text-orange-400 font-bold text-[9px] flex items-center gap-0.5 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/30">
                    🔥 {(user as any).currentStreak}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Center Navigation */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-1 hide-scrollbar">
          {menuItems.map((item) => {
            const tab =
              new URLSearchParams(location.search).get("tab") || "record";
            const itemUrl = new URL(item.href, "http://localhost");
            const targetTab = itemUrl.searchParams.get("tab") || "";
            const isActive =
              item.href === "/ai"
                ? location.pathname === "/ai"
                : location.pathname === "/dashboard" &&
                  (targetTab ? tab === targetTab : tab === "record");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onToggle}
                className={cn(
                  "tap-target flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-xl transition-all duration-200 group relative select-none",
                  "hover:bg-white/10 active:scale-98",
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 font-bold border-r-2 border-emerald-500 shadow-xs"
                    : "text-white/70 hover:text-white",
                )}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-transform duration-200",
                    hoveredItem === item.label && "scale-110",
                  )}
                />
                <span className="text-xs font-semibold whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <Link
            to="/pro"
            onClick={onToggle}
            className={cn(
              "tap-target flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-xl transition-all duration-200 group relative select-none",
              "hover:bg-white/10 active:scale-98",
              location.pathname === "/pro"
                ? "bg-amber-500/15 text-amber-300 font-bold border-r-2 border-amber-400 shadow-xs"
                : "text-white/70 hover:text-white",
            )}
          >
            <Crown className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="text-xs font-semibold whitespace-nowrap">
              البرو والأسعار
            </span>
          </Link>

          <Link
            to="/bank-sync"
            onClick={onToggle}
            className={cn(
              "tap-target flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-xl transition-all duration-200 group relative select-none",
              "hover:bg-white/10 active:scale-98",
              location.pathname === "/bank-sync"
                ? "bg-emerald-500/15 text-emerald-300 font-bold border-r-2 border-emerald-400 shadow-xs"
                : "text-white/70 hover:text-white",
            )}
          >
            <Smartphone className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="text-xs font-semibold whitespace-nowrap">
              الربط البنكي
            </span>
          </Link>

          {/* Administrator-only link */}
          {isAdmin && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-[10px] font-bold text-white/40 px-3 uppercase tracking-wider">
                  الإدارة
                </p>
              </div>
              <Link
                to="/admin"
                onClick={onToggle}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 min-h-[40px] rounded-xl transition-all duration-200 group relative select-none",
                  "hover:bg-white/10 active:scale-98",
                  location.pathname === "/admin"
                    ? "bg-amber-500/15 text-amber-400 font-bold border-r-2 border-amber-500 shadow-xs"
                    : "text-white/70 hover:text-white",
                )}
              >
                <Shield className="w-4 h-4 shrink-0 text-amber-400" />
                <span className="text-xs font-semibold">لوحة الأدمن</span>
              </Link>
            </>
          )}
        </nav>

        {/* Pinned Bottom Footer (Always Visible above Safe Area) */}
        <div className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 space-y-1 bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onToggle}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 text-xs font-semibold active:scale-98 select-none"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              if (isOpen) onToggle();
              setShowLogoutConfirm(true);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 text-xs font-bold active:scale-98 select-none"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Calm & Professional Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent
          className="z-[100005] max-w-sm rounded-2xl border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-6 text-end"
          dir="rtl"
        >
          <AlertDialogHeader className="text-end space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-1">
              <LogOut className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-base font-black text-slate-900 dark:text-white">
              تسجيل الخروج
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              هل تريد تسجيل الخروج من حسابك؟ سيتوجب عليك تسجيل الدخول مجدداً
              للمتابعة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse justify-start gap-2 mt-4 sm:space-x-0">
            <Button
              variant="destructive"
              className="rounded-xl font-bold text-xs h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              onClick={() => {
                setShowLogoutConfirm(false);
                logout();
              }}
            >
              تسجيل الخروج
            </Button>
            <Button
              variant="outline"
              className="rounded-xl font-semibold text-xs h-9 px-4 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setShowLogoutConfirm(false)}
            >
              إلغاء
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
