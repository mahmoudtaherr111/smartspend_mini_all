/**
 * Typed Capacitor 8 bridge for SmartSpend AI's native iOS plugins:
 * - `LiquidGlassTabBar` (floating iOS 26 UIGlassEffect / iOS 15–18 UIBlurEffect tab bar + Hot Bar)
 * - `SmartSpendNative` (capabilities, native LAContext Face ID / Touch ID, native haptics)
 *
 * Safe no-op / graceful fallback on Web, PWA, and Android so non-iOS platforms keep working identically.
 */
import * as CapacitorCore from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { getApiBaseUrl, isNgrokUrl } from "./api-url";

export type LiquidGlassTheme = "dark" | "light";

export interface LiquidGlassTabItem {
  id: string;
  label: string;
  route: string;
  sfSymbol: string;
  badge?: number;
}

export interface LiquidGlassHotAction {
  id: string;
  label: string;
  sfSymbol: string;
  accessibilityLabel?: string;
}

export interface LiquidGlassConfigureOptions {
  items: LiquidGlassTabItem[];
  activeId: string;
  hotAction?: LiquidGlassHotAction | null;
  theme: LiquidGlassTheme;
  rtl: boolean;
  visible?: boolean;
}

export interface LiquidGlassConfigureResult {
  height: number;
  bottomInset: number;
  totalHeight: number;
  usesNativeGlass: boolean;
}

export interface LiquidGlassMetrics {
  height: number;
  bottomInset: number;
  totalHeight: number;
  visible: boolean;
  usesNativeGlass: boolean;
}

export interface LiquidGlassTabSelectedEvent {
  id: string;
  route: string;
}

export interface LiquidGlassHotActionEvent {
  id: string;
}

export interface LiquidGlassTabBarPlugin {
  configure(
    options: LiquidGlassConfigureOptions,
  ): Promise<LiquidGlassConfigureResult>;
  setActiveTab(options: {
    id: string;
    animated?: boolean;
  }): Promise<{ activeId: string }>;
  setVisible(options: {
    visible: boolean;
    animated?: boolean;
  }): Promise<{ visible: boolean }>;
  setTheme(options: {
    theme: LiquidGlassTheme;
  }): Promise<{ theme: LiquidGlassTheme }>;
  setBadge(options: {
    id: string;
    count: number;
  }): Promise<{ id: string; count: number }>;
  getMetrics(): Promise<LiquidGlassMetrics>;
  addListener(
    eventName: "tabSelected",
    listenerFunc: (event: LiquidGlassTabSelectedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "hotActionPressed",
    listenerFunc: (event: LiquidGlassHotActionEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export type NativeBiometricType = "faceId" | "touchId" | "opticId" | "none";

export interface SmartSpendNativeCapabilities {
  platform: "ios" | "android" | "web";
  iosVersion: string;
  iosMajorVersion: number;
  supportsNativeLiquidGlass: boolean;
  hasBiometrics: boolean;
  biometricType: NativeBiometricType;
  canEvaluateDeviceOwnerAuth: boolean;
}

export type NativeBiometricErrorCode =
  | "cancelled"
  | "user_fallback"
  | "biometry_not_available"
  | "biometry_not_enrolled"
  | "biometry_lockout"
  | "passcode_not_set"
  | "system_cancel"
  | "failed"
  | "error";

export interface NativeBiometricAuthOptions {
  reason?: string;
  fallbackTitle?: string;
  allowDevicePasscode?: boolean;
}

export interface NativeBiometricAuthResult {
  success: boolean;
  errorCode?: NativeBiometricErrorCode;
  message?: string;
}

export type NativeHapticStyle =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error";

export interface SmartSpendNativePlugin {
  getCapabilities(): Promise<SmartSpendNativeCapabilities>;
  authenticateBiometric(
    options?: NativeBiometricAuthOptions,
  ): Promise<NativeBiometricAuthResult>;
  triggerHaptic(options: {
    style: NativeHapticStyle;
  }): Promise<{ triggered: boolean }>;
  setSessionToken(options: {
    token: string;
  }): Promise<{ saved: boolean }>;
  getAuthHeaders(): Promise<{ headers: Record<string, string> }>;
  clearSessionToken(): Promise<{ cleared: boolean }>;
}

const NOOP_LISTENER_HANDLE: PluginListenerHandle = {
  remove: async () => {},
};

function createLiquidGlassWebFallback(): LiquidGlassTabBarPlugin {
  return {
    async configure() {
      return {
        height: 0,
        bottomInset: 0,
        totalHeight: 0,
        usesNativeGlass: false,
      };
    },
    async setActiveTab(options) {
      return { activeId: options.id };
    },
    async setVisible(options) {
      return { visible: options.visible };
    },
    async setTheme(options) {
      return { theme: options.theme };
    },
    async setBadge(options) {
      return { id: options.id, count: options.count };
    },
    async getMetrics() {
      return {
        height: 0,
        bottomInset: 0,
        totalHeight: 0,
        visible: false,
        usesNativeGlass: false,
      };
    },
    async addListener() {
      return NOOP_LISTENER_HANDLE;
    },
  };
}

function getCapacitorPlatformSafe(): string {
  try {
    return CapacitorCore.Capacitor?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

function createSmartSpendNativeWebFallback(): SmartSpendNativePlugin {
  return {
    async getCapabilities() {
      const platform = getCapacitorPlatformSafe();
      return {
        platform:
          platform === "ios" || platform === "android" ? platform : "web",
        iosVersion: "",
        iosMajorVersion: 0,
        supportsNativeLiquidGlass: false,
        hasBiometrics: false,
        biometricType: "none",
        canEvaluateDeviceOwnerAuth: false,
      };
    },
    async authenticateBiometric() {
      return {
        success: false,
        errorCode: "biometry_not_available",
      };
    },
    async triggerHaptic() {
      return { triggered: false };
    },
    async setSessionToken() {
      return { saved: false };
    },
    async getAuthHeaders() {
      return { headers: {} };
    },
    async clearSessionToken() {
      return { cleared: true };
    },
  };
}

function safeRegisterPlugin<T>(name: string, fallbackFactory: () => T): T {
  try {
    const reg = (
      CapacitorCore as unknown as {
        registerPlugin?: <P>(
          pluginName: string,
          options?: { web?: () => P },
        ) => P;
      }
    ).registerPlugin;
    if (typeof reg === "function") {
      return reg<T>(name, { web: fallbackFactory });
    }
  } catch {
    // Partial test mocks of @capacitor/core may omit registerPlugin
  }
  return fallbackFactory();
}

export const LiquidGlassTabBar = safeRegisterPlugin<LiquidGlassTabBarPlugin>(
  "LiquidGlassTabBar",
  createLiquidGlassWebFallback,
);

export const SmartSpendNative = safeRegisterPlugin<SmartSpendNativePlugin>(
  "SmartSpendNative",
  createSmartSpendNativeWebFallback,
);

/**
 * True only when executing inside the real Capacitor iOS native shell.
 * Returns false on Web, PWA (including iOS Safari / standalone PWA), and Android.
 */
export function isNativeIosCapacitor(): boolean {
  try {
    return (
      Boolean(CapacitorCore.Capacitor?.isNativePlatform?.()) &&
      getCapacitorPlatformSafe() === "ios"
    );
  } catch {
    return false;
  }
}

export async function configureNativeTabBar(
  options: LiquidGlassConfigureOptions,
): Promise<LiquidGlassConfigureResult | null> {
  if (!isNativeIosCapacitor()) return null;
  try {
    return await LiquidGlassTabBar.configure(options);
  } catch {
    return null;
  }
}

export async function setNativeActiveTab(
  id: string,
  animated = true,
): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  try {
    await LiquidGlassTabBar.setActiveTab({ id, animated });
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

export async function setNativeTabBarVisible(
  visible: boolean,
  animated = true,
): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  try {
    await LiquidGlassTabBar.setVisible({ visible, animated });
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

export async function setNativeTabBarTheme(
  theme: LiquidGlassTheme,
): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  try {
    await LiquidGlassTabBar.setTheme({ theme });
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

export async function setNativeTabBarBadge(
  id: string,
  count: number,
): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  try {
    await LiquidGlassTabBar.setBadge({ id, count });
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

export async function getNativeTabBarMetrics(): Promise<LiquidGlassMetrics | null> {
  if (!isNativeIosCapacitor()) return null;
  try {
    return await LiquidGlassTabBar.getMetrics();
  } catch {
    return null;
  }
}

export async function addNativeTabSelectedListener(
  listener: (event: LiquidGlassTabSelectedEvent) => void,
): Promise<PluginListenerHandle> {
  if (!isNativeIosCapacitor()) return NOOP_LISTENER_HANDLE;
  try {
    return await LiquidGlassTabBar.addListener("tabSelected", listener);
  } catch {
    return NOOP_LISTENER_HANDLE;
  }
}

export async function addNativeHotActionListener(
  listener: (event: LiquidGlassHotActionEvent) => void,
): Promise<PluginListenerHandle> {
  if (!isNativeIosCapacitor()) return NOOP_LISTENER_HANDLE;
  try {
    return await LiquidGlassTabBar.addListener("hotActionPressed", listener);
  } catch {
    return NOOP_LISTENER_HANDLE;
  }
}

export async function getNativeIosCapabilities(): Promise<SmartSpendNativeCapabilities | null> {
  if (!isNativeIosCapacitor()) return null;
  try {
    return await SmartSpendNative.getCapabilities();
  } catch {
    return null;
  }
}

export async function authenticateNativeIosBiometric(
  options?: NativeBiometricAuthOptions,
): Promise<NativeBiometricAuthResult | null> {
  if (!isNativeIosCapacitor()) return null;
  try {
    return await SmartSpendNative.authenticateBiometric(options);
  } catch {
    return {
      success: false,
      errorCode: "error",
    };
  }
}

export async function triggerNativeIosHaptic(
  style: NativeHapticStyle,
): Promise<boolean> {
  if (!isNativeIosCapacitor()) return false;
  try {
    const res = await SmartSpendNative.triggerHaptic({ style });
    return Boolean(res?.triggered);
  } catch {
    return false;
  }
}

export const NATIVE_TABBAR_HEIGHT_CSS_VAR = "--native-tabbar-height";

/**
 * Writes or clears the exact pixel clearance needed above the floating native iOS
 * Liquid Glass Tab Bar so scrollable content is never obscured behind it.
 */
export function syncNativeTabBarHeightCssVar(totalHeight: number | null): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (totalHeight !== null && Number.isFinite(totalHeight) && totalHeight > 0) {
    root.style.setProperty(
      NATIVE_TABBAR_HEIGHT_CSS_VAR,
      `${Math.ceil(totalHeight)}px`,
    );
    root.classList.add("native-ios-tabbar");
  } else {
    root.style.removeProperty(NATIVE_TABBAR_HEIGHT_CSS_VAR);
    root.classList.remove("native-ios-tabbar");
  }
}

/**
 * Stores the session token in the native iOS Keychain (never localStorage or JS memory).
 * No-ops on Web, PWA, and Android.
 */
export async function setNativeSessionToken(
  token: string | null | undefined,
): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  const trimmed = token?.trim() ?? "";
  try {
    if (!trimmed) {
      await SmartSpendNative.clearSessionToken();
    } else {
      await SmartSpendNative.setSessionToken({ token: trimmed });
    }
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

/**
 * Clears the native iOS Keychain session token.
 * No-ops on Web, PWA, and Android.
 */
export async function clearNativeSessionToken(): Promise<void> {
  if (!isNativeIosCapacitor()) return;
  try {
    await SmartSpendNative.clearSessionToken();
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
}

/**
 * Per-request headers for Capacitor iOS calling a remote HTTPS backend:
 * - Reads native auth headers constructed directly from the iOS Keychain in Swift.
 * - Adds ngrok's warning-skip header only when targeting an ngrok tunnel URL.
 * Always returns `{}` on Web, PWA, and Android so browser sessions remain HttpOnly-cookie-only.
 */
export async function getNativeRequestHeaders(
  apiBaseUrl?: string | null,
): Promise<Record<string, string>> {
  if (!isNativeIosCapacitor()) return {};
  const headers: Record<string, string> = {};
  try {
    const result = await SmartSpendNative.getAuthHeaders();
    const nativeHeaders = result?.headers;
    if (nativeHeaders && typeof nativeHeaders === "object") {
      for (const [key, value] of Object.entries(nativeHeaders)) {
        if (typeof value === "string" && value.length > 0) {
          headers[key] = value;
        }
      }
    }
  } catch {
    // Graceful degradation if native plugin is unavailable
  }
  if (isNgrokUrl(apiBaseUrl ?? getApiBaseUrl())) {
    headers["ngrok-skip-browser-warning"] = "true";
  }
  return headers;
}
