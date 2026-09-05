import { useEffect, useState } from "react";
import type { HomeTab } from "./HomeHeader";
import { cn } from "@/lib/utils";

export const DEFAULT_TAB_ORDER: HomeTab[] = ["record", "stats", "calendar"];

interface NativeTabPanelsProps {
  activeTab: HomeTab;
  tabOrder?: HomeTab[];
  children: Record<HomeTab, React.ReactNode>;
  className?: string;
}

/**
 * Root-level destinations must not behave like a horizontally paged carousel.
 * Panels mount on first visit and stay mounted afterwards, preserving drafts
 * and component state while switching instantly like a native tab container.
 */
export function NativeTabPanels({
  activeTab,
  tabOrder = DEFAULT_TAB_ORDER,
  children,
  className,
}: NativeTabPanelsProps) {
  const [mountedTabs, setMountedTabs] = useState<Set<HomeTab>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    setMountedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <div className={cn("w-full", className)} data-testid="native-tab-panels">
      {tabOrder.map((tab) => {
        if (!mountedTabs.has(tab) && tab !== activeTab) return null;

        const isActive = tab === activeTab;
        return (
          <section
            key={tab}
            id={`home-panel-${tab}`}
            role="tabpanel"
            aria-label={
              tab === "record"
                ? "تسجيل"
                : tab === "stats"
                  ? "إحصائيات"
                  : "تقويم"
            }
            aria-hidden={!isActive}
            data-tab-key={tab}
            data-state={isActive ? "active" : "inactive"}
            hidden={!isActive}
            className={cn(isActive ? "block" : "hidden")}
          >
            {children[tab]}
          </section>
        );
      })}
    </div>
  );
}
