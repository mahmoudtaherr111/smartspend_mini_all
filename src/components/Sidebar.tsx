import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Receipt, 
  BarChart3, 
  Brain, 
  Calendar, 
  Settings, 
  Shield, 
  HelpCircle, 
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Crown,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: "الرئيسية", href: "/" },
  { icon: Receipt, label: "تسجيل مصروف", href: "/?tab=record" },
  { icon: BarChart3, label: "إحصائيات", href: "/?tab=stats" },
  { icon: Brain, label: "تحليل AI", href: "/?tab=ai" },
  { icon: Calendar, label: "التقويم", href: "/?tab=calendar" },
];

const bottomItems = [
  { icon: HelpCircle, label: "الدعم", href: "/support" },
  { icon: Settings, label: "الإعدادات", href: "/settings" },
];

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { user, isAdmin, isModerator, isPro, logout } = useAuth();
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
          isOpen ? "w-72 translate-x-0" : "w-72 translate-x-full lg:translate-x-0 lg:w-20"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className={cn("flex items-center gap-3 transition-all duration-300", !isOpen && "lg:opacity-0 lg:w-0")}>
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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggle}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            {isOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* User info */}
        {user && (
          <div className={cn(
            "px-5 py-4 border-b border-white/10 transition-all duration-300",
            !isOpen && "lg:px-2 lg:py-3"
          )}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  user.name?.charAt(0) || "U"
                )}
              </div>
              <div className={cn("transition-all duration-300 overflow-hidden", !isOpen && "lg:w-0 lg:opacity-0")}>
                <p className="text-white font-medium text-sm truncate">{user.name}</p>
                <p className="text-white/50 text-xs truncate">{user.plan === "pro" ? "PRO" : "Free"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.href || location.search.includes(item.href.split("?")[1] || "");
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
                <span className={cn(
                  "text-sm font-medium transition-all duration-300 whitespace-nowrap",
                  !isOpen && "lg:w-0 lg:opacity-0"
                )}>
                  {item.label}
                </span>

                {/* Tooltip for collapsed state */}
                {!isOpen && (
                  <div className="absolute right-full mr-3 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl border border-white/10">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Admin/Moderator links */}
          {(isAdmin || isModerator) && (
            <>
              <div className={cn("pt-4 pb-2 transition-all duration-300", !isOpen && "lg:opacity-0")}>
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
                <span className={cn("text-sm font-medium transition-all duration-300", !isOpen && "lg:w-0 lg:opacity-0")}>
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
                <span className={cn("text-sm font-medium transition-all duration-300", !isOpen && "lg:w-0 lg:opacity-0")}>
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
            <span className={cn("text-sm font-medium transition-all duration-300", !isOpen && "lg:w-0 lg:opacity-0")}>
              خروج
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
