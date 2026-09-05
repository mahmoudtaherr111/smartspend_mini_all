/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// PWA & Mobile UX Utilities & Algorithms
// ============================================================================

/**
 * Mathematically accurate iOS rubber-banding resistance calculation
 */
export function rubberband(distance: number, dimension: number, constant = 0.55): number {
  return (distance * dimension * constant) / (dimension + constant * distance);
}

/**
 * Checks if a touch event originated inside an actively scrollable inner container (e.g. table, modal, chips).
 * If inner container is scrolled down (scrollTop > 0), Pull-To-Refresh must NOT trigger.
 */
export function shouldIsolatePullToRefresh(path: EventTarget[], rootScrollEl: HTMLElement): boolean {
  for (const target of path) {
    if (target === rootScrollEl || target === document || target === window) {
      break;
    }
    if (target instanceof HTMLElement) {
      const style = window.getComputedStyle(target);
      const isScrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        target.scrollHeight > target.clientHeight;

      if (isScrollable && target.scrollTop > 0) {
        return true; // Isolate: inner container is scrolled
      }
    }
  }
  return false;
}

/**
 * Virtual Keyboard Viewport Manager for PWA / Mobile Web
 */
export class VirtualKeyboardManager {
  private isKeyboardOpen = false;
  private keyboardHeight = 0;
  private rootElement: HTMLElement;

  constructor(root: HTMLElement) {
    this.rootElement = root;
  }

  public handleViewportResize(windowHeight: number, visualViewportHeight: number): {
    isOpen: boolean;
    height: number;
  } {
    const heightDiff = windowHeight - visualViewportHeight;
    const isOpen = heightDiff > 80;

    this.isKeyboardOpen = isOpen;
    this.keyboardHeight = isOpen ? heightDiff : 0;

    if (isOpen) {
      this.rootElement.classList.add("keyboard-active");
      this.rootElement.style.setProperty("--keyboard-height", `${heightDiff}px`);
      this.rootElement.style.setProperty("--visual-viewport-height", `${visualViewportHeight}px`);
    } else {
      this.rootElement.classList.remove("keyboard-active");
      this.rootElement.style.setProperty("--keyboard-height", "0px");
      this.rootElement.style.setProperty("--visual-viewport-height", `${windowHeight}px`);
    }

    return { isOpen: this.isKeyboardOpen, height: this.keyboardHeight };
  }

  public getIsOpen(): boolean {
    return this.isKeyboardOpen;
  }

  public getHeight(): number {
    return this.keyboardHeight;
  }
}

/**
 * Atomic Offline Sync Queue with Unique Entity ID Deletion
 */
export interface OfflineItem {
  id: string; // Unique entity ID (UUID)
  text?: string;
  amount?: number;
  category?: string;
  timestamp: number;
  synced?: boolean;
}

export class AtomicOfflineQueue {
  private storageKey: string;

  constructor(storageKey = "smartspend_offline_items") {
    this.storageKey = storageKey;
  }

  public getItems(): OfflineItem[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public addItem(item: Omit<OfflineItem, "id"> & { id?: string }): OfflineItem {
    const items = this.getItems();
    const newItem: OfflineItem = {
      ...item,
      id: item.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    items.push(newItem);
    localStorage.setItem(this.storageKey, JSON.stringify(items));
    window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
    return newItem;
  }

  public deleteItemById(id: string): boolean {
    const items = this.getItems();
    const filtered = items.filter((item) => item.id !== id);
    if (filtered.length !== items.length) {
      localStorage.setItem(this.storageKey, JSON.stringify(filtered));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      return true;
    }
    return false;
  }

  public deleteMultipleByIds(ids: string[]): number {
    const idSet = new Set(ids);
    const items = this.getItems();
    const filtered = items.filter((item) => !idSet.has(item.id));
    const deletedCount = items.length - filtered.length;
    if (deletedCount > 0) {
      localStorage.setItem(this.storageKey, JSON.stringify(filtered));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
    }
    return deletedCount;
  }

  public clear(): void {
    localStorage.removeItem(this.storageKey);
    window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
  }
}

// ============================================================================
// TEST SUITE: PWA Mobile UX & Layout Stability
// ============================================================================

describe("PWA Mobile UX, Virtual Keyboard & Scroll Isolation Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tier 1: Virtual Keyboard Detection & CSS Variable Offsets
  // --------------------------------------------------------------------------
  describe("Tier 1: Virtual Keyboard & Viewport Management", () => {
    it("1.1 detects keyboard open when visualViewport height shrinks by >80px", () => {
      const root = document.documentElement;
      const manager = new VirtualKeyboardManager(root);

      const result = manager.handleViewportResize(800, 500); // 300px keyboard

      expect(result.isOpen).toBe(true);
      expect(result.height).toBe(300);
      expect(root.classList.contains("keyboard-active")).toBe(true);
      expect(root.style.getPropertyValue("--keyboard-height")).toBe("300px");
      expect(root.style.getPropertyValue("--visual-viewport-height")).toBe("500px");
    });

    it("1.2 detects keyboard close when visualViewport restores to full height", () => {
      const root = document.documentElement;
      const manager = new VirtualKeyboardManager(root);

      // Open
      manager.handleViewportResize(800, 500);
      expect(manager.getIsOpen()).toBe(true);

      // Close
      const result = manager.handleViewportResize(800, 800);
      expect(result.isOpen).toBe(false);
      expect(result.height).toBe(0);
      expect(root.classList.contains("keyboard-active")).toBe(false);
      expect(root.style.getPropertyValue("--keyboard-height")).toBe("0px");
      expect(root.style.getPropertyValue("--visual-viewport-height")).toBe("800px");
    });

    it("1.3 ignores minor viewport jitter (<80px) like browser address bar toggles", () => {
      const root = document.documentElement;
      const manager = new VirtualKeyboardManager(root);

      // Small 40px delta from browser URL bar auto-hide
      const result = manager.handleViewportResize(800, 760);
      expect(result.isOpen).toBe(false);
      expect(result.height).toBe(0);
      expect(root.classList.contains("keyboard-active")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 2: Pull-To-Refresh Inner Container Scroll Isolation
  // --------------------------------------------------------------------------
  describe("Tier 2: Pull-To-Refresh Inner Scroll Isolation & Rubberband Calculation", () => {
    it("2.1 calculates authentic iOS rubber-banding resistance curve", () => {
      const dim = 800;

      const r1 = rubberband(50, dim);
      const r2 = rubberband(100, dim);
      const r3 = rubberband(150, dim);

      expect(r1).toBeGreaterThan(0);
      expect(r2).toBeGreaterThan(r1);
      expect(r3).toBeGreaterThan(r2);

      // Resistance diminishes progressively (derivative < 1)
      expect(r3 - r2).toBeLessThan(r2 - r1);
    });

    it("2.2 isolates PTR when touch occurs inside a scrolled inner element (scrollTop > 0)", () => {
      const rootEl = document.createElement("div");
      const innerContainer = document.createElement("div");

      // Mock scrollable container with content scrolled down
      Object.defineProperty(innerContainer, "scrollTop", { value: 120, configurable: true });
      Object.defineProperty(innerContainer, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(innerContainer, "clientHeight", { value: 200, configurable: true });
      innerContainer.style.overflowY = "auto";

      const eventPath = [innerContainer, rootEl, document.body];
      const shouldIsolate = shouldIsolatePullToRefresh(eventPath, rootEl);

      expect(shouldIsolate).toBe(true);
    });

    it("2.3 allows PTR when inner element is at the top (scrollTop === 0)", () => {
      const rootEl = document.createElement("div");
      const innerContainer = document.createElement("div");

      Object.defineProperty(innerContainer, "scrollTop", { value: 0, configurable: true });
      Object.defineProperty(innerContainer, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(innerContainer, "clientHeight", { value: 200, configurable: true });
      innerContainer.style.overflowY = "auto";

      const eventPath = [innerContainer, rootEl, document.body];
      const shouldIsolate = shouldIsolatePullToRefresh(eventPath, rootEl);

      expect(shouldIsolate).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 3: Offline Sync Atomic Deletions by Unique Entity ID
  // --------------------------------------------------------------------------
  describe("Tier 3: Atomic Offline Sync Queue & Race-Free Deletions", () => {
    it("3.1 assigns unique entity IDs and stores items safely in localStorage", () => {
      const queue = new AtomicOfflineQueue("smartspend_test_offline");

      const item1 = queue.addItem({ text: "غداء كشري 45 جنيه", timestamp: 1000 });
      const item2 = queue.addItem({ text: "تاكسي 30 جنيه", timestamp: 2000 });

      expect(item1.id).toBeDefined();
      expect(item2.id).toBeDefined();
      expect(item1.id).not.toBe(item2.id);

      const items = queue.getItems();
      expect(items).toHaveLength(2);
      expect(items[0].text).toBe("غداء كشري 45 جنيه");
      expect(items[1].text).toBe("تاكسي 30 جنيه");
    });

    it("3.2 atomically deletes item by unique ID without index-shifting race conditions", () => {
      const queue = new AtomicOfflineQueue("smartspend_test_offline");

      const item1 = queue.addItem({ text: "بند 1", timestamp: 1000 });
      const item2 = queue.addItem({ text: "بند 2", timestamp: 2000 });
      const item3 = queue.addItem({ text: "بند 3", timestamp: 3000 });

      // Concurrent scenario: User deletes item 1 while item 2 is in background sync
      const deleted = queue.deleteItemById(item1.id);
      expect(deleted).toBe(true);

      const remaining = queue.getItems();
      expect(remaining).toHaveLength(2);
      expect(remaining.map((i) => i.id)).toEqual([item2.id, item3.id]);

      // Deleting item 3 by ID succeeds regardless of previous array position
      const deleted3 = queue.deleteItemById(item3.id);
      expect(deleted3).toBe(true);

      expect(queue.getItems().map((i) => i.id)).toEqual([item2.id]);
    });

    it("3.3 deletes multiple synced items atomically in a single operation", () => {
      const queue = new AtomicOfflineQueue("smartspend_test_offline");

      const i1 = queue.addItem({ text: "عملية 1", timestamp: 1 });
      const i2 = queue.addItem({ text: "عملية 2", timestamp: 2 });
      const i3 = queue.addItem({ text: "عملية 3", timestamp: 3 });

      const deletedCount = queue.deleteMultipleByIds([i1.id, i3.id]);
      expect(deletedCount).toBe(2);

      const remaining = queue.getItems();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(i2.id);
    });

    it("3.4 dispatches queue change events for multi-tab reactivity", () => {
      const queue = new AtomicOfflineQueue("smartspend_test_offline");
      const listener = vi.fn();

      window.addEventListener("smartspend-offline-queue-changed", listener);

      queue.addItem({ text: "تسوق 150", timestamp: Date.now() });
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener("smartspend-offline-queue-changed", listener);
    });
  });
});
