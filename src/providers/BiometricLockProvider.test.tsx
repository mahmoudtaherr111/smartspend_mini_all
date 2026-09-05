/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import {
  BiometricLockProvider,
  useBiometricLock,
} from "./BiometricLockProvider";
import * as biometricAuth from "@/lib/biometricAuth";

// Mock useAuth
const mockUser = {
  id: 10,
  name: "Mahmoud",
  email: "mahmoud@example.com",
  role: "user" as const,
  plan: "pro" as const,
  type: "local" as const,
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

let currentContext: ReturnType<typeof useBiometricLock> | null = null;

function TestConsumer() {
  const ctx = useBiometricLock();
  currentContext = ctx;

  return (
    <div>
      <div data-testid="is-locked">{ctx.isLocked ? "true" : "false"}</div>
      <div data-testid="is-enabled">{ctx.isLockEnabled ? "true" : "false"}</div>
      <div data-testid="has-pin">{ctx.hasPin ? "true" : "false"}</div>
      <div data-testid="privacy-mask">{ctx.isPrivacyMaskActive ? "true" : "false"}</div>
      <div data-testid="grace-period">{ctx.gracePeriod}</div>
    </div>
  );
}

describe("BiometricLockProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    currentContext = null;
    vi.restoreAllMocks();
    // Default mock: biometric prompt fails / cancelled so auto-unlock doesn't bypass locked state
    vi.spyOn(biometricAuth, "authenticateLocalBiometrics").mockResolvedValue({
      success: false,
      reason: "cancelled",
      message: "تم إلغاء التحقق",
    });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("initializes unlocked when lock is disabled", () => {
    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    expect(screen.getByTestId("is-locked").textContent).toBe("false");
    expect(screen.getByTestId("is-enabled").textContent).toBe("false");
  });

  it("enables lock with PIN and updates state", async () => {
    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    await act(async () => {
      await currentContext?.enableLock("1234");
    });

    expect(screen.getByTestId("is-enabled").textContent).toBe("true");
    expect(screen.getByTestId("has-pin").textContent).toBe("true");
  });

  it("locks app if enabled and grace period has elapsed since last unlock", () => {
    const userKey = "local_10";
    biometricAuth.setBiometricLockEnabled(userKey, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now() - 40000, userKey); // 40s ago (>30s)

    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    expect(screen.getByTestId("is-locked").textContent).toBe("true");
    expect(screen.getByTestId("is-enabled").textContent).toBe("true");
  });

  it("unlocks successfully with PIN", async () => {
    const userKey = "local_10";
    biometricAuth.setBiometricLockEnabled(userKey, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now() - 40000, userKey);
    await biometricAuth.setBiometricPin(userKey, "1234");

    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    expect(screen.getByTestId("is-locked").textContent).toBe("true");

    // Attempt invalid PIN
    let isInvalidSuccess = true;
    await act(async () => {
      isInvalidSuccess = (await currentContext?.unlockWithPin("0000")) ?? true;
    });
    expect(isInvalidSuccess).toBe(false);
    expect(screen.getByTestId("is-locked").textContent).toBe("true");

    // Attempt valid PIN
    let isValidSuccess = false;
    await act(async () => {
      isValidSuccess = (await currentContext?.unlockWithPin("1234")) ?? false;
    });
    expect(isValidSuccess).toBe(true);
    expect(screen.getByTestId("is-locked").textContent).toBe("false");
  });

  it("handles lifecycle grace period and privacy masking on visibilitychange", async () => {
    const userKey = "local_10";
    biometricAuth.setBiometricLockEnabled(userKey, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now(), userKey);

    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    // 1. Simulate tab becoming hidden (backgrounded)
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("privacy-mask").textContent).toBe("true");

    // 2. Simulate resuming within 5 seconds (<30s grace period)
    biometricAuth.setLastActiveTimestamp(Date.now() - 5000, userKey);
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("privacy-mask").textContent).toBe("false");
    expect(screen.getByTestId("is-locked").textContent).toBe("false");

    // 3. Simulate resuming after 35 seconds (>30s grace period)
    biometricAuth.setLastActiveTimestamp(Date.now() - 35000, userKey);
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("is-locked").textContent).toBe("true");
  });

  it("maintains device-scoped user isolation: User A unlock does not unlock User B", () => {
    const userA = "local_10";
    const userB = "local_20";

    // User A unlocked recently
    biometricAuth.setBiometricLockEnabled(userA, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now(), userA);

    // User B enabled lock but hasn't unlocked yet
    biometricAuth.setBiometricLockEnabled(userB, true);
    expect(biometricAuth.getLastUnlockedTimestamp(userB)).toBe(0);

    // Current user in provider mock is User A (local_10) -> unlocked
    const { unmount } = render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );
    expect(screen.getByTestId("is-locked").textContent).toBe("false");
    unmount();
  });

  it("does not show privacy mask on window blur if document is still visible", () => {
    const userKey = "local_10";
    biometricAuth.setBiometricLockEnabled(userKey, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now(), userKey);

    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
    });

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(screen.getByTestId("privacy-mask").textContent).toBe("false");
  });

  it("synchronizes lock and unlock state across tabs via storage events", () => {
    const userKey = "local_10";
    biometricAuth.setBiometricLockEnabled(userKey, true);
    biometricAuth.setLastUnlockedTimestamp(Date.now() - 40000, userKey); // locked

    render(
      <BiometricLockProvider>
        <TestConsumer />
      </BiometricLockProvider>,
    );

    expect(screen.getByTestId("is-locked").textContent).toBe("true");

    // Simulate another tab unlocking
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: `smartspend_biometric_last_unlocked_${userKey}`,
          newValue: Date.now().toString(),
        }),
      );
    });

    expect(screen.getByTestId("is-locked").textContent).toBe("false");
  });
});
