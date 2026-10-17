/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readBiometricPromptRecord } from "@/lib/biometricAuth";

const mutateSpy = vi.fn();
const prefetchSpy = vi.fn();

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/dashboard" }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 7, type: "local" } }),
}));

vi.mock("@/hooks/usePasskeyEnrolment", () => ({
  usePasskeyEnrolment: () => ({
    prefetch: prefetchSpy,
    enrol: vi.fn().mockResolvedValue(true),
    isEnrolling: false,
  }),
}));

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profile: { getSmartProfile: { invalidate: vi.fn() } },
    }),
    webauthn: {
      checkHasPasskey: {
        useQuery: () => ({ data: { hasPasskey: false } }),
      },
    },
    profile: {
      getSmartProfile: {
        useQuery: () => ({ data: { preferences: {} } }),
      },
      updateSmartProfile: {
        useMutation: () => ({ mutate: mutateSpy }),
      },
    },
  },
}));

import { useBiometricOnboarding } from "./useBiometricOnboarding";

describe("useBiometricOnboarding", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    mutateSpy.mockClear();
    prefetchSpy.mockClear();
    (globalThis as unknown as { window: Window & { PublicKeyCredential?: unknown } }).window.PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("counts 'Not now' only once per showing even when both button click and dialog close fire", async () => {
    const { result } = renderHook(() => useBiometricOnboarding());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.open).toBe(true);
    expect(mutateSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.notNow();
      result.current.notNow();
    });

    expect(result.current.open).toBe(false);
    expect(mutateSpy).toHaveBeenCalledTimes(2);
    expect(mutateSpy).toHaveBeenLastCalledWith({
      preferences: expect.objectContaining({
        biometricPromptDismissals: 1,
      }),
    });
    expect(readBiometricPromptRecord({}, "local_7").dismissals).toBe(1);
  });
});
