/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCapacitor, mockLiquidGlass, mockSmartSpendNative, registerPluginSpy } =
  vi.hoisted(() => {
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
      setSessionToken: vi.fn(),
      getAuthHeaders: vi.fn(),
      clearSessionToken: vi.fn(),
    };
    const registerPluginSpy = vi.fn((name: string) => {
      if (name === "LiquidGlassTabBar") return mockLiquidGlass;
      if (name === "SmartSpendNative") return mockSmartSpendNative;
      return {};
    });
    return {
      mockCapacitor,
      mockLiquidGlass,
      mockSmartSpendNative,
      registerPluginSpy,
    };
  });

vi.mock("@capacitor/core", () => ({
  Capacitor: mockCapacitor,
  registerPlugin: registerPluginSpy,
}));

import {
  NATIVE_TABBAR_HEIGHT_CSS_VAR,
  authenticateNativeIosBiometric,
  clearNativeSessionToken,
  configureNativeTabBar,
  getNativeIosCapabilities,
  getNativeRequestHeaders,
  getNativeTabBarMetrics,
  isNativeIosCapacitor,
  setNativeActiveTab,
  setNativeSessionToken,
  setNativeTabBarBadge,
  setNativeTabBarTheme,
  setNativeTabBarVisible,
  syncNativeTabBarHeightCssVar,
  triggerNativeIosHaptic,
} from "./native-ios-bridge";
import {
  authenticateLocalBiometrics,
  isPlatformAuthenticatorAvailable,
} from "./biometricAuth";

describe("native-ios-bridge", () => {
  beforeEach(() => {
    mockCapacitor.isNativePlatform.mockReset().mockReturnValue(false);
    mockCapacitor.getPlatform.mockReset().mockReturnValue("web");
    Object.values(mockLiquidGlass).forEach((fn) => fn.mockReset());
    Object.values(mockSmartSpendNative).forEach((fn) => fn.mockReset());
    document.documentElement.style.removeProperty(NATIVE_TABBAR_HEIGHT_CSS_VAR);
    document.documentElement.classList.remove("native-ios-tabbar");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers the exact Capacitor Swift plugin names", () => {
    const names = registerPluginSpy.mock.calls.map((call) => call[0]);
    expect(names).toContain("LiquidGlassTabBar");
    expect(names).toContain("SmartSpendNative");
  });

  it("safely no-ops on Web and Android platforms", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(false);
    mockCapacitor.getPlatform.mockReturnValue("web");

    expect(isNativeIosCapacitor()).toBe(false);
    expect(
      await configureNativeTabBar({
        items: [],
        activeId: "record",
        theme: "light",
        rtl: true,
      }),
    ).toBeNull();
    expect(await getNativeTabBarMetrics()).toBeNull();
    expect(await getNativeIosCapabilities()).toBeNull();
    expect(await authenticateNativeIosBiometric()).toBeNull();
    expect(await triggerNativeIosHaptic("light")).toBe(false);
    expect(mockLiquidGlass.configure).not.toHaveBeenCalled();
    expect(mockSmartSpendNative.triggerHaptic).not.toHaveBeenCalled();

    // Android native is also NOT iOS native
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("android");
    expect(isNativeIosCapacitor()).toBe(false);
    expect(await triggerNativeIosHaptic("medium")).toBe(false);
    expect(mockSmartSpendNative.triggerHaptic).not.toHaveBeenCalled();
  });

  it("delegates to LiquidGlassTabBar and SmartSpendNative on Capacitor iOS", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");

    mockLiquidGlass.configure.mockResolvedValue({
      height: 62,
      bottomInset: 34,
      totalHeight: 96,
      usesNativeGlass: true,
    });
    mockLiquidGlass.setActiveTab.mockResolvedValue({ activeId: "ai" });
    mockLiquidGlass.setVisible.mockResolvedValue({ visible: true });
    mockLiquidGlass.setTheme.mockResolvedValue({ theme: "dark" });
    mockLiquidGlass.setBadge.mockResolvedValue({ id: "more", count: 3 });
    mockSmartSpendNative.triggerHaptic.mockResolvedValue({ triggered: true });

    expect(isNativeIosCapacitor()).toBe(true);

    const cfg = await configureNativeTabBar({
      items: [
        {
          id: "record",
          label: "تسجيل",
          route: "/dashboard?tab=record",
          sfSymbol: "plus.circle.fill",
        },
      ],
      activeId: "record",
      hotAction: {
        id: "quick-action",
        label: "سجّل",
        sfSymbol: "mic.fill",
      },
      theme: "dark",
      rtl: true,
      visible: true,
    });

    expect(mockLiquidGlass.configure).toHaveBeenCalledTimes(1);
    expect(cfg).toEqual({
      height: 62,
      bottomInset: 34,
      totalHeight: 96,
      usesNativeGlass: true,
    });

    await setNativeActiveTab("ai", true);
    expect(mockLiquidGlass.setActiveTab).toHaveBeenCalledWith({
      id: "ai",
      animated: true,
    });

    await setNativeTabBarVisible(true, true);
    expect(mockLiquidGlass.setVisible).toHaveBeenCalledWith({
      visible: true,
      animated: true,
    });

    await setNativeTabBarTheme("dark");
    expect(mockLiquidGlass.setTheme).toHaveBeenCalledWith({ theme: "dark" });

    await setNativeTabBarBadge("more", 3);
    expect(mockLiquidGlass.setBadge).toHaveBeenCalledWith({
      id: "more",
      count: 3,
    });

    expect(await triggerNativeIosHaptic("success")).toBe(true);
    expect(mockSmartSpendNative.triggerHaptic).toHaveBeenCalledWith({
      style: "success",
    });
  });

  it("writes and clears the --native-tabbar-height CSS variable", () => {
    syncNativeTabBarHeightCssVar(96.4);
    expect(
      document.documentElement.style.getPropertyValue(
        NATIVE_TABBAR_HEIGHT_CSS_VAR,
      ),
    ).toBe("97px");
    expect(
      document.documentElement.classList.contains("native-ios-tabbar"),
    ).toBe(true);

    syncNativeTabBarHeightCssVar(null);
    expect(
      document.documentElement.style.getPropertyValue(
        NATIVE_TABBAR_HEIGHT_CSS_VAR,
      ),
    ).toBe("");
    expect(
      document.documentElement.classList.contains("native-ios-tabbar"),
    ).toBe(false);
  });

  it("uses SmartSpendNative Face ID / Touch ID in biometricAuth on Capacitor iOS", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");

    mockSmartSpendNative.getCapabilities.mockResolvedValue({
      platform: "ios",
      iosVersion: "26.0",
      iosMajorVersion: 26,
      supportsNativeLiquidGlass: true,
      hasBiometrics: true,
      biometricType: "faceId",
      canEvaluateDeviceOwnerAuth: true,
    });

    expect(await isPlatformAuthenticatorAvailable()).toBe(true);

    mockSmartSpendNative.authenticateBiometric
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, errorCode: "cancelled" })
      .mockResolvedValueOnce({ success: false, errorCode: "biometry_lockout" })
      .mockResolvedValueOnce({
        success: false,
        errorCode: "biometry_not_enrolled",
      });

    const ok = await authenticateLocalBiometrics();
    expect(ok.success).toBe(true);
    expect(mockSmartSpendNative.authenticateBiometric).toHaveBeenCalledWith(
      expect.objectContaining({ allowDevicePasscode: false }),
    );

    const cancelled = await authenticateLocalBiometrics();
    expect(cancelled.success).toBe(false);
    expect(cancelled.reason).toBe("cancelled");

    const locked = await authenticateLocalBiometrics();
    expect(locked.success).toBe(false);
    expect(locked.reason).toBe("not_allowed");

    const notEnrolled = await authenticateLocalBiometrics();
    expect(notEnrolled.success).toBe(false);
    expect(notEnrolled.reason).toBe("not_supported");
  });

  it("keeps web requests cookie-only and delegates auth headers + ngrok skip header on Capacitor iOS", async () => {
    mockCapacitor.isNativePlatform.mockReturnValue(false);
    mockCapacitor.getPlatform.mockReturnValue("web");

    expect(
      await getNativeRequestHeaders(
        "https://nutty-husband-customary.ngrok-free.dev/api/trpc",
      ),
    ).toEqual({});
    await setNativeSessionToken("ignored-on-web");
    await clearNativeSessionToken();
    expect(mockSmartSpendNative.getAuthHeaders).not.toHaveBeenCalled();
    expect(mockSmartSpendNative.setSessionToken).not.toHaveBeenCalled();
    expect(mockSmartSpendNative.clearSessionToken).not.toHaveBeenCalled();

    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.getPlatform.mockReturnValue("ios");
    mockSmartSpendNative.getAuthHeaders.mockResolvedValue({
      headers: { Authorization: "Bearer ios-keychain-jwt" },
    });
    mockSmartSpendNative.setSessionToken.mockResolvedValue({ saved: true });
    mockSmartSpendNative.clearSessionToken.mockResolvedValue({ cleared: true });

    expect(
      await getNativeRequestHeaders(
        "https://nutty-husband-customary.ngrok-free.dev/api/trpc",
      ),
    ).toEqual({
      Authorization: "Bearer ios-keychain-jwt",
      "ngrok-skip-browser-warning": "true",
    });
    expect(
      await getNativeRequestHeaders("https://api.smartspend.app/api/trpc"),
    ).toEqual({
      Authorization: "Bearer ios-keychain-jwt",
    });
    expect(mockSmartSpendNative.getAuthHeaders).toHaveBeenCalledTimes(2);

    await setNativeSessionToken("new-ios-jwt");
    expect(mockSmartSpendNative.setSessionToken).toHaveBeenCalledWith({
      token: "new-ios-jwt",
    });

    await clearNativeSessionToken();
    expect(mockSmartSpendNative.clearSessionToken).toHaveBeenCalledTimes(1);
  });
});
