import { lazy, Suspense, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageSquare, Phone, BarChart3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/hooks/useHaptics";
import { Skeleton } from "@/components/ui/skeleton";

const AIChatbot = lazy(() => import("@/components/ai/AIChatbot"));
const VoiceCallTab = lazy(() => import("@/components/voice/VoiceCallTab"));
const AIMonthlyReport = lazy(() => import("@/components/ai/AIMonthlyReport"));

import { useLanguage } from "@/i18n/context";
import type { MessageKey } from "@/i18n/ar";

type AITab = "chat" | "voice" | "report";

interface AITabConfig {
  id: AITab;
  labelKey: MessageKey;
  icon: typeof MessageSquare;
  gradient: string;
  bgActive: string;
  textActive: string;
  descKey: MessageKey;
}

const aiTabs: AITabConfig[] = [
  {
    id: "chat",
    labelKey: "aiCenter.tab.chat",
    icon: MessageSquare,
    gradient: "from-indigo-500 to-violet-600",
    bgActive: "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/30",
    textActive: "text-indigo-600 dark:text-indigo-400",
    descKey: "aiCenter.tab.chatDesc",
  },
  {
    id: "voice",
    labelKey: "aiCenter.tab.voice",
    icon: Phone,
    gradient: "from-emerald-500 to-teal-600",
    bgActive: "bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/30",
    textActive: "text-emerald-600 dark:text-emerald-400",
    descKey: "aiCenter.tab.voiceDesc",
  },
  {
    id: "report",
    labelKey: "aiCenter.tab.report",
    icon: BarChart3,
    gradient: "from-amber-500 to-orange-600",
    bgActive: "bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30",
    textActive: "text-amber-600 dark:text-amber-400",
    descKey: "aiCenter.tab.reportDesc",
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
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeAiTab(searchParams.get("ai_tab"));
  const { lightTap } = useHaptics();

  // Keep-alive tracker: once a tab has been activated, keep it mounted to preserve
  // chat message history, voice streams, uncommitted drafts, and scroll positions.
  const [mountedTabs, setMountedTabs] = useState<Record<AITab, boolean>>(() => ({
    chat: true,
    voice: activeTab === "voice",
    report: activeTab === "report",
  }));

  useEffect(() => {
    if (!mountedTabs[activeTab]) {
      setMountedTabs((prev) => ({ ...prev, [activeTab]: true }));
    }
  }, [activeTab, mountedTabs]);

  const selectTab = (tab: AITab) => {
    if (tab === activeTab) return;
    setMountedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
    const next = new URLSearchParams(searchParams);
    next.set("ai_tab", tab);
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
            <h1 className="text-lg font-bold text-foreground">{t("aiCenter.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("aiCenter.subtitle")}</p>
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
                  {t(tab.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area with Offscreen Keep-Alive */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Chat Tab Keep-Alive */}
        {mountedTabs.chat && (
          <div
            className={cn(
              "h-full w-full absolute inset-0 transition-opacity duration-200",
              activeTab === "chat"
                ? "opacity-100 z-10 pointer-events-auto"
                : "opacity-0 z-0 pointer-events-none invisible"
            )}
            aria-hidden={activeTab !== "chat"}
          >
            <Suspense fallback={<TabSkeleton />}>
              <AIChatbot />
            </Suspense>
          </div>
        )}

        {/* Voice Call Tab Keep-Alive */}
        {mountedTabs.voice && (
          <div
            className={cn(
              "h-full w-full absolute inset-0 transition-opacity duration-200",
              activeTab === "voice"
                ? "opacity-100 z-10 pointer-events-auto"
                : "opacity-0 z-0 pointer-events-none invisible"
            )}
            aria-hidden={activeTab !== "voice"}
          >
            <Suspense fallback={<TabSkeleton />}>
              <VoiceCallTab />
            </Suspense>
          </div>
        )}

        {/* Monthly Report Tab Keep-Alive */}
        {mountedTabs.report && (
          <div
            className={cn(
              "h-full w-full absolute inset-0 transition-opacity duration-200 overflow-y-auto",
              activeTab === "report"
                ? "opacity-100 z-10 pointer-events-auto"
                : "opacity-0 z-0 pointer-events-none invisible"
            )}
            aria-hidden={activeTab !== "report"}
          >
            <Suspense fallback={<TabSkeleton />}>
              <AIMonthlyReport />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
