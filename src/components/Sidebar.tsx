import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import darkModeLogo from "../../photos/dark_mode_logo-removebg-preview.png";
import whiteModeLogo from "../../photos/white_mode_logo-removebg-preview.png";
import defaultProfile from "../../photos/profile.png";

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
  const { user, isAdmin, isModerator, isPro, hasUltraAccess, logout } =
    useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const isFetching = useIsFetching();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed start-0 top-0 h-full z-50 transition-all duration-500 ease-out",
          "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950",
          "border-e border-white/10 shadow-2xl",
          isOpen
            ? "w-72 translate-x-0"
            : "w-72 -translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3 transition-all duration-300">
            <img
              src={whiteModeLogo}
              alt="SmartSpend"
              className="h-20 w-auto object-contain block dark:hidden no-drag pointer-events-none select-none"
            />
            <img
              src={darkModeLogo}
              alt="SmartSpend"
              className="h-20 w-auto object-contain hidden dark:block no-drag pointer-events-none select-none"
            />
            {isPro && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
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
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="text-white/70 hover:text-white hover:bg-white/10 lg:hidden"
            >
              {isOpen ? (
                <ChevronLeft className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="px-5 py-4 border-b border-white/10 transition-all duration-300">
            <div className="flex flex-col">
              <p className="text-white font-medium text-sm truncate">
                {user.name}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-white/80 font-semibold text-[10px] truncate bg-white/20 px-2 py-0.5 rounded shadow-sm">
                  {user.plan === "ultra"
                    ? "ULTRA"
                    : user.plan === "pro"
                      ? "PRO"
                      : "مجاني"}
                </p>
                {(user as any).currentStreak > 0 && (
                  <p className="text-orange-400 font-bold text-[10px] truncate flex items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/30 shadow-sm animate-pulse">
                    🔥 {(user as any).currentStreak} أيام
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const tab =
              new URLSearchParams(location.search).get("tab") || "record";
            const itemUrl = new URL(item.href, "http://localhost");
            const targetTab = itemUrl.searchParams.get("tab") || "";
            const isActive = item.href === "/ai"
              ? location.pathname === "/ai"
              : location.pathname === "/dashboard" && (targetTab ? tab === targetTab : tab === "record");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "tap-target flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl transition-all duration-300 group relative",
                  "hover:bg-white/10 hover:translate-x-1 active:bg-white/15",
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-r-2 border-emerald-500"
                    : "text-white/70",
                )}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-transform duration-300",
                    hoveredItem === item.label && "scale-110",
                  )}
                />
                <span className="text-sm font-medium transition-all duration-300 whitespace-nowrap">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <Link
            to="/pro"
            className={cn(
              "tap-target flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl transition-all duration-300 group relative",
              "hover:bg-white/10 hover:translate-x-1 active:bg-white/15",
              location.pathname === "/pro"
                ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-r-2 border-amber-400"
                : "text-white/70",
            )}
          >
            <Crown className="w-5 h-5 shrink-0 text-amber-400" />
            <span className="text-sm font-medium whitespace-nowrap">
              البرو والأسعار
            </span>
          </Link>

          <Link
            to="/bank-sync"
            className={cn(
              "tap-target flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl transition-all duration-300 group relative",
              "hover:bg-white/10 hover:translate-x-1 active:bg-white/15",
              location.pathname === "/bank-sync"
                ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border-r-2 border-emerald-400"
                : "text-white/70",
            )}
          >
            <Smartphone className="w-5 h-5 shrink-0 text-emerald-400" />
            <span className="text-sm font-medium whitespace-nowrap">
              الربط البنكي
            </span>
          </Link>

          {/* Admin/Moderator links */}
          {(isAdmin || isModerator) && (
            <>
              <div className="pt-4 pb-2 transition-all duration-300">
                <p className="text-xs text-white/40 px-3 uppercase tracking-wider">
                  لوحة التحكم
                </p>
              </div>
              <Link
                to="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative",
                  "hover:bg-white/10 hover:translate-x-1",
                  location.pathname === "/admin"
                    ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-r-2 border-amber-500"
                    : "text-white/70",
                )}
              >
                <Shield className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium transition-all duration-300">
                  {isAdmin ? "الأدمن" : "المدير"}
                </span>
              </Link>
            </>
          )}
        </nav>

        {/* Bottom items */}
        <div className="px-3 pb-4 space-y-1">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-300 group relative"
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium transition-all duration-300">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium transition-all duration-300">
              خروج
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
