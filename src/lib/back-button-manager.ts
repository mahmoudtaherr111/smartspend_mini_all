import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

export type BackButtonHandler = () => boolean | void;

export interface BackButtonEntry {
  id: string;
  priority: number; // Higher number = higher priority, executed first
  order: number; // Monotonically increasing sequence number for LIFO resolution
  handler: BackButtonHandler;
}

class BackButtonManager {
  private stack: BackButtonEntry[] = [];
  private isInitialized = false;
  private lastRootBackPress = 0;
  private nextId = 1;
  private suppressedPopstates = 0;

  public init(customRootChecker?: () => boolean): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (Capacitor.isNativePlatform()) {
      App.addListener("backButton", ({ canGoBack }) => {
        this.handleBack(customRootChecker, canGoBack);
      }).catch(() => {});
    }

    // Web / PWA popstate listener coordination
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () => {
        if (this.suppressedPopstates > 0) {
          this.suppressedPopstates -= 1;
          return;
        }
        if (this.stack.length > 0) {
          // If there's an active overlay registered, execute top handler
          this.executeTopHandler();
        }
      });
    }
  }

  public register(handler: BackButtonHandler, priority = 10): () => void {
    const order = this.nextId++;
    const id = `back_handler_${order}`;
    const entry: BackButtonEntry = {
      id,
      priority,
      order,
      handler,
    };

    this.stack.push(entry);
    this.sortStack();

    return () => {
      this.unregister(id);
    };
  }

  public unregister(id: string): void {
    this.stack = this.stack.filter((entry) => entry.id !== id);
  }

  private sortStack(): void {
    // Sort descending by priority; if priorities match, sort descending by order (LIFO)
    this.stack.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.order - a.order;
    });
  }

  public executeTopHandler(): boolean {
    if (this.stack.length === 0) return false;

    // Shift the highest priority / topmost handler
    const topEntry = this.stack.shift();
    if (!topEntry) return false;

    try {
      const result = topEntry.handler();
      // If result is explicitly false, continue looking for other handlers
      if (result === false && this.stack.length > 0) {
        return this.executeTopHandler();
      }
      return true;
    } catch (err) {
      console.error(
        "[BackButtonManager] Error executing back button handler:",
        err,
      );
      return true;
    }
  }

  public handleBack(
    customRootChecker?: () => boolean,
    canGoBack?: boolean,
  ): void {
    // 1. If any modal / drawer / sheet is active on the stack, dismiss it first
    if (this.stack.length > 0) {
      const handled = this.executeTopHandler();
      if (handled) return;
    }

    // 2. Determine if currently at root route
    const isRoot = customRootChecker
      ? customRootChecker()
      : this.isDefaultRootRoute();

    if (isRoot) {
      const now = Date.now();
      if (now - this.lastRootBackPress < 2000) {
        if (Capacitor.isNativePlatform()) {
          App.exitApp().catch(() => {});
        }
      } else {
        this.lastRootBackPress = now;
        toast.info("اضغط مرة أخرى للخروج", { duration: 2000 });
      }
    } else {
      if (canGoBack !== false && typeof window !== "undefined") {
        window.history.back();
      }
    }
  }

  private isDefaultRootRoute(): boolean {
    if (typeof window === "undefined") return false;
    const path = window.location.pathname;
    return (
      path === "/" ||
      path === "/dashboard" ||
      path === "/login" ||
      path === "/home"
    );
  }

  public getStackLength(): number {
    return this.stack.length;
  }

  /**
   * Programmatic removal of an overlay also removes its same-URL history
   * sentinel. The resulting popstate is bookkeeping, not another Back action.
   */
  public suppressNextPopstate(): void {
    this.suppressedPopstates += 1;
  }

  public clear(): void {
    this.stack = [];
    this.lastRootBackPress = 0;
    this.nextId = 1;
    this.suppressedPopstates = 0;
  }
}

export const backButtonManager = new BackButtonManager();

export function registerBackButtonHandler(
  handler: BackButtonHandler,
  priority = 10,
): () => void {
  return backButtonManager.register(handler, priority);
}

export function initBackButtonListener(
  customRootChecker?: () => boolean,
): void {
  backButtonManager.init(customRootChecker);
}

export function suppressNextBackPopstate(): void {
  backButtonManager.suppressNextPopstate();
}
