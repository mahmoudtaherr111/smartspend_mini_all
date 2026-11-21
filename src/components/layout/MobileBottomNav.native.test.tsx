/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { LanguageProvider } from "@/i18n/LanguageProvider";

const { mockCapacitor, mockLiquidGlass, mockSmartSpendNative } = vi.hoisted(
  () => {
    const mockCapacitor = {
      isNativePlatform: vi.fn(() => false),
      getPlatform: vi.fn(() => "web"),
    };
    const mockLiquidGlass = {
      configure: vi.fn(),
      setActiveTab: vi.fn(),
      setVisible: vi.fn(),
      setTheme: vi.fn(),
      setBadge: vi.fn(),
      getMetrics: vi.fn(),
      addListener: vi.fn(),
    };
    const mockSmartSpendNative = {
      getCapabilities: vi.fn(),
      authenticateBiometric: vi.fn(),
      triggerHaptic: vi.fn(),
    };
    return { mockCapacitor, mockLiquidGlass, mockSmartSpendNative };
  },
);

vi.mock("@capacitor/core", () => ({
  Capacitor: mockCapacitor,
  registerPlugin: vi.fn((name: string) => {
    if (name === "LiquidGlassTabBar") return mockLiquidGlass;
    if (name === "SmartSpendNative") return mockSmartSpendNative;
    return {};
  }),
}));

let mockIsKeyboardOpen = false;

vi.mock("@/hooks/useVirtualKeyboard", () => ({
  useVirtualKeyboard: () => ({
    isKeyboardOpen: mockIsKeyboardOpen,
    keyboardHeight: mockIsKeyboardOpen ? 300 : 0,
  }),
}));

import {
  NATIVE_TABBAR_HEIGHT_CSS_VAR,
  type LiquidGlassHotActionEvent,
  type LiquidGlassTabSelectedEvent,
} from "@/lib/native-ios-bridge";
import { MobileBottomNav } from "./MobileBottomNav";

function LocationProbe({ onChange }: { onChange: (full: string) => void }) {
  const loc = useLocation();
  onChange(`${loc.pathname}${loc.search}`);
  return null;
}

describe("MobileBottomNav — native iOS LiquidGlassTabBar integration", () => {
  let tabSelectedCallback:
    | ((event: LiquidGlassTabSelectedEvent) => void)
    | null = null;
  let hotActionCallback: ((event: LiquidGlassHotActionEvent) => void) | null =
    null;
  let removeTabListenerSpy: ReturnType<typeof vi.fn>;
  let removeHotListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCapacitor.isNativePlatform.mockReset().mockReturnValue(false);
    mockCapacitor.getPlatform.mockReset().mockReturnValue("web");
    Object.values(mockLiquidGlass).forEach((fn) => fn.mockReset());
    Object.values(mockSmartSpendNative).forEach((fn) => fn.mockReset());
    mockIsKeyboardOpen = false;
    tabSelectedCallback = null;
    hotActionCallback = null;
    removeTabListenerSpy = vi.fn().mockResolvedValue(undefined);
    removeHotListenerSpy = vi.fn().mockResolvedValue(undefined);
    localStorage.clear();
    document.documentElement.style.removeProperty(NATIVE_TABBAR_HEIGHT_CSS_VAR);
    document.documentElement.classList.remove("native-ios-tabbar");

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderNav(
    initialEntry = "/dashboard?tab=record",
    onLocationChange?: (full: string) => void,
  ) {
    return render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <LanguageProvider englishAccess="allowed">
          <MemoryRouter initialEntries={[initialEntry]}>
            <MobileBottomNav />
            {onLocationChange && <LocationProbe onChange={onLocationChange} />}
          </MemoryRouter>
        </LanguageProvider>
      </ThemeProvider>,
    );
  }

  it("mounts native LiquidGlassTabBar on Capacitor iOS, syncs metrics & handles tab/hot-action events", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");

    mockLiquidGlass.configure.mockResolvedValue({
      height: 60,
      bottomInset: 34,
      totalHeight: 94,
      usesNativeGlass: true,
    });
    mockLiquidGlass.setVisible.mockResolvedValue({ visible: true });
    mockLiquidGlass.setActiveTab.mockResolvedValue({ activeId: "stats" });
    mockSmartSpendNative.triggerHaptic.mockResolvedValue({ triggered: true });

    mockLiquidGlass.addListener.mockImplementation(
      async (eventName: string, cb: unknown) => {
        if (eventName === "tabSelected") {
          tabSelectedCallback = cb as (
            event: LiquidGlassTabSelectedEvent,
          ) => void;
          return { remove: removeTabListenerSpy };
        }
        hotActionCallback = cb as (event: LiquidGlassHotActionEvent) => void;
        return { remove: removeHotListenerSpy };
      },
    );

    let currentUrl = "";
    const { queryByTestId, unmount } = renderNav(
      "/dashboard?tab=record&month=2026-08",
      (full) => {
        currentUrl = full;
      },
    );

    // Must not render duplicate DOM bottom nav on Capacitor iOS
    expect(queryByTestId("mobile-bottom-nav")).toBeNull();

    await waitFor(() => {
      expect(mockLiquidGlass.configure).toHaveBeenCalledTimes(1);
    });

    const configArg = mockLiquidGlass.configure.mock.calls[0][0];
    expect(configArg.rtl).toBe(true);
    expect(configArg.activeId).toBe("record");
    expect(configArg.visible).toBe(true);
    expect(
      configArg.items.map((item: { id: string }) => item.id),
    ).toEqual(["record", "stats", "ai", "calendar", "more"]);
    expect(configArg.hotAction).toEqual(
      expect.objectContaining({
        id: "quick-action",
        sfSymbol: "mic.fill",
      }),
    );

    // CSS var reflects totalHeight (94) + 12px breathing room = 106px
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue(
          NATIVE_TABBAR_HEIGHT_CSS_VAR,
        ),
      ).toBe("106px");
    });

    // Simulate tapping Stats tab in native bar: must preserve month=2026-08
    await act(async () => {
      tabSelectedCallback?.({ id: "stats", route: "/dashboard?tab=stats" });
    });

    expect(currentUrl).toBe("/dashboard?tab=stats&month=2026-08");
    await waitFor(() => {
      expect(mockLiquidGlass.setActiveTab).toHaveBeenCalledWith({
        id: "stats",
        animated: true,
      });
    });

    // Simulate tapping Hot Action button: navigates to record tab + dispatches quick-action event + focuses #expense-input
    const quickActionEvents: CustomEvent[] = [];
    const onQuickAction = (e: Event) => quickActionEvents.push(e as CustomEvent);
    window.addEventListener("smartspend:quick-action", onQuickAction);

    const inputEl = document.createElement("textarea");
    inputEl.id = "expense-input";
    document.body.appendChild(inputEl);
    const focusSpy = vi.spyOn(inputEl, "focus");

    await act(async () => {
      hotActionCallback?.({ id: "quick-action" });
    });

    expect(currentUrl).toBe("/dashboard?tab=record&month=2026-08");
    expect(quickActionEvents).toHaveLength(1);
    expect(focusSpy).toHaveBeenCalled();

    window.removeEventListener("smartspend:quick-action", onQuickAction);
    inputEl.remove();

    // Unmount (e.g. logout) must hide native bar, clear CSS var, and remove listeners
    unmount();
    expect(mockLiquidGlass.setVisible).toHaveBeenLastCalledWith({
      visible: false,
      animated: false,
    });
    expect(
      document.documentElement.style.getPropertyValue(
        NATIVE_TABBAR_HEIGHT_CSS_VAR,
      ),
    ).toBe("");
    await waitFor(() => {
      expect(removeTabListenerSpy).toHaveBeenCalled();
      expect(removeHotListenerSpy).toHaveBeenCalled();
    });
  });

  it("hides native LiquidGlassTabBar on non-tab routes (/settings/security) and when keyboard opens", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");

    mockLiquidGlass.configure.mockResolvedValue({
      height: 60,
      bottomInset: 34,
      totalHeight: 94,
      usesNativeGlass: true,
    });
    mockLiquidGlass.setVisible.mockResolvedValue({ visible: false });
    mockLiquidGlass.addListener.mockResolvedValue({
      remove: vi.fn().mockResolvedValue(undefined),
    });

    const { unmount } = renderNav("/settings/security");
    await waitFor(() => {
      expect(mockLiquidGlass.setVisible).toHaveBeenCalledWith({
        visible: false,
        animated: true,
      });
    });
    expect(
      document.documentElement.style.getPropertyValue(
        NATIVE_TABBAR_HEIGHT_CSS_VAR,
      ),
    ).toBe("");
    unmount();

    // Now on a visible tab route, but with virtual keyboard open
    mockLiquidGlass.setVisible.mockClear();
    mockIsKeyboardOpen = true;
    const { unmount: unmount2 } = renderNav("/dashboard?tab=record");
    await waitFor(() => {
      expect(mockLiquidGlass.setVisible).toHaveBeenCalledWith({
        visible: false,
        animated: true,
      });
    });
    unmount2();
  });

  it("preserves the HTML bottom nav on Web / PWA and never invokes native configure", () => {
    mockCapacitor.isNativePlatform.mockReturnValue(false);
    mockCapacitor.getPlatform.mockReturnValue("web");

    const { getByTestId } = renderNav("/plan");

    expect(getByTestId("mobile-bottom-nav")).toBeInTheDocument();
    expect(mockLiquidGlass.configure).not.toHaveBeenCalled();
  });
});
