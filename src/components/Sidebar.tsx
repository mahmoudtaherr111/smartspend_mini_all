import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
  Moon
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "الرئيسية", href: "/dashboard" },
  { icon: BarChart3, label: "إحصائيات", href: "/dashboard?tab=stats" },
  { icon: Brain, label: "تحليل AI", href: "/dashboard?tab=ai" },
  { icon: Calendar, label: "التقويم", href: "/dashboard?tab=calendar" },
];

const bottomItems = [
  { icon: HelpCircle, label: "الدعم", href: "/support" },
  { icon: User, label: "الملف الشخصي", href: "/settings" },
];

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { user, isAdmin, isModerator, isPro, hasUltraAccess, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

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
          "fixed right-0 top-0 h-full z-50 transition-all duration-500 ease-out",
          "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950",
          "border-l border-white/10 shadow-2xl",
          isOpen ? "w-72 translate-x-0" : "w-72 translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3 transition-all duration-300">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">SS</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">SmartSpend</h1>
              {isPro && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Crown className="w-3 h-3" /> PRO
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onToggle}
              className="text-white/70 hover:text-white hover:bg-white/10 lg:hidden"
            >
              {isOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="px-5 py-4 border-b border-white/10 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  user.name?.charAt(0) || "U"
                )}
              </div>
              <div className="transition-all duration-300 overflow-hidden">
                <p className="text-white font-medium text-sm truncate">{user.name}</p>
                <p className="text-white/50 text-xs truncate">
                  {user.plan === "ultra" ? "ULTRA" : user.plan === "pro" ? "PRO" : "مجاني"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const tab = new URLSearchParams(location.search).get("tab") || "record";
            const targetTab = new URLSearchParams(item.href.split("?")[1] || "").get("tab") || "record";
            const isActive = location.pathname === "/dashboard" && tab === targetTab;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative",
                  "hover:bg-white/10 hover:translate-x-1",
                  isActive ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-r-2 border-emerald-500" : "text-white/70"
                )}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Icon className={cn(
                  "w-5 h-5 shrink-0 transition-transform duration-300",
                  hoveredItem === item.label && "scale-110"
                )} />
                <span className="text-sm font-medium transition-all duration-300 whitespace-nowrap">
                  {item.label}
                </span>

              </Link>
            );
          })}

          <Link
            to="/pro"
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative",
              "hover:bg-white/10 hover:translate-x-1",
              location.pathname === "/pro"
                ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-r-2 border-amber-400"
                : "text-white/70"
            )}
          >
            <Crown className="w-5 h-5 shrink-0 text-amber-400" />
            <span className="text-sm font-medium whitespace-nowrap">البرو والأسعار</span>
          </Link>

          {hasUltraAccess && (
            <Link
              to="/ultra"
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative",
                "hover:bg-white/10 hover:translate-x-1",
                location.pathname === "/ultra"
                  ? "bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-200 border-r-2 border-violet-400"
                  : "text-white/70"
              )}
            >
              <Sparkles className="w-5 h-5 shrink-0 text-violet-300" />
              <span className="text-sm font-medium whitespace-nowrap">مساحة ألترا</span>
            </Link>
          )}

          {/* Admin/Moderator links */}
          {(isAdmin || isModerator) && (
            <>
              <div className="pt-4 pb-2 transition-all duration-300">
                <p className="text-xs text-white/40 px-3 uppercase tracking-wider">لوحة التحكم</p>
              </div>
              <Link
                to="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 group relative",
                  "hover:bg-white/10 hover:translate-x-1",
                  location.pathname === "/admin" ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-r-2 border-amber-500" : "text-white/70"
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
