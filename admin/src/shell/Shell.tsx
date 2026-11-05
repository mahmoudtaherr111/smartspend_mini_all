import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Banknote,
  BookOpen,
  Brain,
  Building2,
  ChartLine,
  Cpu,
  Home,
  Megaphone,
  LifeBuoy,
  SlidersHorizontal,
  LogOut,
  Menu,
  Plug,
  Receipt,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@admin/kit/button";
import { trpc } from "@admin/lib/trpc";

interface Area {
  to: string;
  label: string;
  hint: string;
  icon: typeof Home;
  adminOnly?: boolean;
}

// The console's areas, named by the work an admin does. An area appears here only once its page is real.
const AREAS: Area[] = [
  {
    to: "/",
    label: "النهارده",
    hint: "الأرقام المهمة واللي مستنيك",
    icon: Home,
    adminOnly: true,
  },
  { to: "/support", label: "الدعم", hint: "اللي مستنيين رد", icon: LifeBuoy },
  {
    to: "/growth",
    label: "النمو",
    hint: "بيسجلوا وبيرجعوا؟ ومن أنهي موبايل",
    icon: ChartLine,
    adminOnly: true,
  },
  {
    to: "/people",
    label: "الناس",
    hint: "كل حساب وكل حاجة عنه",
    icon: Users,
    adminOnly: true,
  },
  {
    to: "/money",
    label: "الفلوس والباقات",
    hint: "الاشتراكات والإيراد وحدود كل باقة",
    icon: Banknote,
    adminOnly: true,
  },
  {
    to: "/ai/calls",
    label: "نداءات الذكاء",
    hint: "كل نداء: مين، ليه، بكام",
    icon: Receipt,
    adminOnly: true,
  },
  {
    to: "/ai/classifications",
    label: "التصنيف وسببه",
    hint: "كل جملة اتفهمت إزاي وليه",
    icon: Brain,
    adminOnly: true,
  },
  {
    to: "/ai/connectors",
    label: "الموصلات",
    hint: "خدمات الذكاء ومفاتيحها",
    icon: Plug,
    adminOnly: true,
  },
  {
    to: "/ai/setup",
    label: "إعداد الذكاء",
    hint: "موديل كل وظيفة والاحتياطي",
    icon: Cpu,
    adminOnly: true,
  },
  {
    to: "/ai/rules",
    label: "القاموس والأسئلة",
    hint: "اللي التطبيق اتعلمه واللي مستني إجابة",
    icon: BookOpen,
    adminOnly: true,
  },
  {
    to: "/bank-messages",
    label: "رسايل البنوك",
    hint: "جرّب رسالة، والأرقام، والبنوك، والإعدادات",
    icon: Building2,
    adminOnly: true,
  },

  {
    to: "/communications",
    label: "التواصل والإعلانات",
    hint: "الإشعارات وواتساب والإعلانات",
    icon: Megaphone,
    adminOnly: true,
  },
  {
    to: "/operations",
    label: "التشغيل",
    hint: "إيقاف الميزات، السقف، التحديثات، السجل",
    icon: SlidersHorizontal,
    adminOnly: true,
  },
  {
    to: "/legacy",
    label: "باقي الأدوات",
    hint: "اللوحة القديمة لحد ما كل قسم يتنقل",
    icon: Wrench,
    adminOnly: true,
  },
];

export function Shell({
  name,
  isAdmin,
  children,
}: {
  name: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const signOut = trpc.localAuth.logout.useMutation({
    onSettled: () => window.location.assign("/admin/"),
  });
  const areas = AREAS.filter((area) => isAdmin || !area.adminOnly);
  // The previous console brings its own menu, so it gets the whole width; this menu stays a tap away.
  const wide = useLocation().pathname.startsWith("/legacy");

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="أقسام الإدارة">
      {areas.map((area) => (
        <NavLink
          key={area.to}
          to={area.to}
          end={area.to === "/"}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300"
                : "hover:bg-muted"
            }`
          }
        >
          <area.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold">{area.label}</span>
            <span className="block text-xs text-muted-foreground">
              {area.hint}
            </span>
          </span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          className={wide ? "" : "lg:hidden"}
          aria-label={open ? "اقفل القايمة" : "افتح القايمة"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
        <span className="font-bold">إدارة SmartSpend</span>
        <span className="flex-1" />
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut.mutate()}
          disabled={signOut.isPending}
        >
          <LogOut className="size-4" aria-hidden />
          خروج
        </Button>
      </header>
      <div className="mx-auto flex max-w-[1500px] gap-6 px-4 py-6">
        <aside className={`hidden w-60 shrink-0 ${wide ? "" : "lg:block"}`}>
          <div className="sticky top-20">{nav}</div>
        </aside>
        {open && (
          <div
            className={`fixed inset-x-0 top-14 z-20 border-b bg-background p-4 shadow-sm ${wide ? "" : "lg:hidden"}`}
          >
            {nav}
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
