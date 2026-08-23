import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Phone, BarChart3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import { Skeleton } from "@/components/ui/skeleton";

const AIChatbot = lazy(() => import("@/components/ai/AIChatbot"));
const AIVoiceCall = lazy(() => import("@/components/ai/AIVoiceCall"));
const AIMonthlyReport = lazy(() => import("@/components/ai/AIMonthlyReport"));

type AITab = "chat" | "voice" | "report";

const aiTabs = [
  {
    id: "chat" as AITab,
    label: "شات ذكي",
    icon: MessageSquare,
    gradient: "from-indigo-500 to-violet-600",
    bgActive: "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/30",
    textActive: "text-indigo-600 dark:text-indigo-400",
    description: "اسأل سمارت أي سؤال مالي",
  },
  {
    id: "voice" as AITab,
    label: "مكالمة صوتية",
    icon: Phone,
    gradient: "from-emerald-500 to-teal-600",
    bgActive: "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/30",
    textActive: "text-emerald-600 dark:text-emerald-400",
    description: "اتكلم مع مستشارك المالي",
  },
  {
    id: "report" as AITab,
    label: "تحليل شهري",
    icon: BarChart3,
    gradient: "from-amber-500 to-orange-600",
    bgActive: "bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30",
    textActive: "text-amber-600 dark:text-amber-400",
    description: "تقرير شهري مفصل بالـ AI",
  },
];

function normalizeAiTab(value: string | null): AITab {
  return value === "voice" || value === "report" || value === "chat" ? value : "chat";
}

function TabSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-8 w-2/3 rounded-xl" />
    </div>
  );
}

export default function AICenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeAiTab(searchParams.get("ai_tab"));
  const { lightTap } = useHaptics();

  const selectTab = (tab: AITab) => {
    if (tab === activeTab) return;
    const next = new URLSearchParams(searchParams);
    next.set("ai_tab", tab);
    // Let the native back gesture return to the prior AI section instead of
    // silently overwriting browser history.
    setSearchParams(next);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-3 pt-2 pb-2 sm:px-6 sm:pt-6">
        <div className="hidden sm:flex items-center gap-2 mb-3 sm:mb-4">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">مركز الذكاء الاصطناعي</h1>
            <p className="text-xs text-muted-foreground">مستشارك المالي الذكي</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {aiTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  lightTap();
                  selectTab(tab.id);
                }}
                className={cn(
                  "tap-target active-press relative flex min-w-0 flex-col items-center gap-1 rounded-xl border p-2 sm:p-3 transition-all duration-300",
                  isActive
                    ? `${tab.bgActive} ${tab.textActive} border shadow-sm`
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="aiTabGlow"
                    className="absolute inset-0 rounded-xl ai-glow"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn("w-5 h-5 relative z-10", isActive && "scale-110")} />
                <span className="relative z-10 max-w-full truncate text-[10px] font-semibold sm:text-[11px]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full"
          >
            <Suspense fallback={<TabSkeleton />}>
              {activeTab === "chat" && <AIChatbot />}
              {activeTab === "voice" && <AIVoiceCall />}
              {activeTab === "report" && <AIMonthlyReport />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
