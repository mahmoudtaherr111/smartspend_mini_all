/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { BiometricOnboardingModal } from "./BiometricOnboardingModal";
import { BiometricLockOverlay } from "./BiometricLockOverlay";
import { PasskeySettings } from "./PasskeySettings";

// Mock router navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams()],
  };
});

// Mock WebAuthn browser API
const mockStartRegistration = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: (...args: unknown[]) => mockStartRegistration(...args),
}));

// Mock tRPC
let mockHasPasskey = false;
const mockInvalidateCheck = vi.fn();
const mockGenerateOptionsMutate = vi
  .fn()
  .mockResolvedValue({ challenge: "test-challenge" });
const mockVerifyRegistrationMutate = vi
  .fn()
  .mockResolvedValue({ success: true });
const mockDeletePasskeyMutate = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/providers/trpc", () => ({
  trpc: {
    useUtils: () => ({
      webauthn: {
        checkHasPasskey: {
          invalidate: mockInvalidateCheck,
        },
      },
    }),
    webauthn: {
      checkHasPasskey: {
        useQuery: () => ({
          data: { hasPasskey: mockHasPasskey },
        }),
      },
      generateRegistrationOptions: {
        useMutation: () => ({
          mutateAsync: mockGenerateOptionsMutate,
        }),
      },
      verifyRegistration: {
        useMutation: () => ({
          mutateAsync: mockVerifyRegistrationMutate,
        }),
      },
      deletePasskey: {
        useMutation: () => ({
          mutateAsync: mockDeletePasskeyMutate,
        }),
      },
    },
  },
}));

// Mock BiometricLockProvider
const mockBiometricContext = {
  isLocked: false,
  isPrivacyMaskActive: false,
  hasPin: true,
  isLockEnabled: false,
  gracePeriod: 30000,
  isAuthenticating: false,
  lastAuthResult: null,
  enableLock: vi.fn(),
  disableLock: vi.fn(),
  setPin: vi.fn(),
  setGracePeriod: vi.fn(),
  unlockWithBiometrics: vi.fn().mockResolvedValue({ success: true }),
  unlockWithPin: vi.fn().mockResolvedValue(true),
};

vi.mock("@/providers/BiometricLockProvider", () => ({
  useBiometricLock: () => mockBiometricContext,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      name: "أحمد علي",
      email: "ahmed@example.com",
      role: "user",
      plan: "free",
      type: "local",
    },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    lightTap: vi.fn(),
    mediumTap: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("Biometric UI Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPasskey = false;
    localStorage.clear();
    mockBiometricContext.hasPin = false;
    mockBiometricContext.isLockEnabled = false;
  });

  describe("BiometricOnboardingModal", () => {
    it("does not render when isOpen is false", () => {
      render(
        <BrowserRouter>
          <BiometricOnboardingModal
            isOpen={false}
            onClose={vi.fn()}
            onPostpone={vi.fn()}
            onOptOut={vi.fn()}
          />
        </BrowserRouter>,
      );

      expect(screen.queryByTestId("biometric-onboarding-modal")).toBeNull();
    });

    it("renders modal content and triggers 1-click navigation to settings tab=passkeys", () => {
      const onClose = vi.fn();
      render(
        <BrowserRouter>
          <BiometricOnboardingModal
            isOpen={true}
            onClose={onClose}
            onPostpone={vi.fn()}
            onOptOut={vi.fn()}
          />
        </BrowserRouter>,
      );

      expect(screen.getByTestId("biometric-onboarding-modal")).toBeDefined();
      expect(screen.getByText("تفعيل الدخول بالبصمة (Face ID)")).toBeDefined();

      const activateBtn = screen.getByText("تفعيل الآن بلمسة واحدة");
      fireEvent.click(activateBtn);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/settings/security?highlight=1");
    });

    it("triggers postpone and opt-out handlers properly", () => {
      const onPostpone = vi.fn();
      const onOptOut = vi.fn();

      render(
        <BrowserRouter>
          <BiometricOnboardingModal
            isOpen={true}
            onClose={vi.fn()}
            onPostpone={onPostpone}
            onOptOut={onOptOut}
          />
        </BrowserRouter>,
      );

      const postponeBtn = screen.getByText("تذكيري لاحقاً");
      fireEvent.click(postponeBtn);
      expect(onPostpone).toHaveBeenCalledTimes(1);

      const optOutBtn = screen.getByText("عدم التذكير مجدداً");
      fireEvent.click(optOutBtn);
      expect(onOptOut).toHaveBeenCalledTimes(1);
    });
  });

  describe("PasskeySettings", () => {
    it("registers passkey directly without popping up a local PIN dialog", async () => {
      mockHasPasskey = false;
      mockStartRegistration.mockResolvedValueOnce({ id: "cred-123" });

      render(
        <BrowserRouter>
          <PasskeySettings />
        </BrowserRouter>,
      );

      expect(screen.getByText("تفعيل الدخول بالبصمة الآن")).toBeDefined();

      // Click "تفعيل الدخول بالبصمة الآن"
      const activateBtn = screen.getByText("تفعيل الدخول بالبصمة الآن");
      await act(async () => {
        fireEvent.click(activateBtn);
      });

      // No PIN dialog should be open
      expect(screen.queryByText("رمز PIN الجديد (4 أرقام):")).toBeNull();

      // SimpleWebAuthn registration should be initiated directly
      expect(mockGenerateOptionsMutate).toHaveBeenCalled();
      expect(mockStartRegistration).toHaveBeenCalled();
      expect(mockVerifyRegistrationMutate).toHaveBeenCalled();
      expect(mockInvalidateCheck).toHaveBeenCalled();
      expect(localStorage.getItem("smartspend_has_passkey")).toBe("1");
    });

    it("renders enrolled state with re-enroll and revocation buttons when passkey is active", async () => {
      mockHasPasskey = true;
      vi.spyOn(window, "confirm").mockReturnValue(true);

      render(
        <BrowserRouter>
          <PasskeySettings />
        </BrowserRouter>,
      );

      expect(screen.getByText("البصمة مفعلة بنجاح على هذا الحساب")).toBeDefined();
      expect(screen.getByText("إعادة ربط البصمة")).toBeDefined();

      const deleteBtn = screen.getByText("إلغاء التفعيل");
      expect(deleteBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(deleteBtn);
      });

      expect(mockDeletePasskeyMutate).toHaveBeenCalled();
      expect(mockInvalidateCheck).toHaveBeenCalled();
      expect(localStorage.getItem("smartspend_has_passkey")).toBeNull();
    });

    it("opens emergency PIN dialog when toggling App Lock without existing PIN", async () => {
      mockBiometricContext.isLockEnabled = false;
      mockBiometricContext.hasPin = false;

      render(
        <BrowserRouter>
          <PasskeySettings />
        </BrowserRouter>,
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();

      // Toggle switch to ON
      await act(async () => {
        fireEvent.click(checkbox);
      });

      // PIN dialog should now be open
      expect(screen.getByText("تعيين رمز PIN احتياطي لقفل التطبيق")).toBeDefined();
    });
  });

  describe("BiometricLockOverlay", () => {
    it("renders privacy mask during OS app switcher when isPrivacyMaskActive is true", () => {
      mockBiometricContext.isLocked = false;
      mockBiometricContext.isPrivacyMaskActive = true;

      render(
        <BrowserRouter>
          <BiometricLockOverlay />
        </BrowserRouter>,
      );

      expect(screen.getByText("SmartSpend AI")).toBeDefined();
    });

    it("renders locked screen and retry button when isLocked is true", async () => {
      mockBiometricContext.isLocked = true;
      mockBiometricContext.isPrivacyMaskActive = false;

      render(
        <BrowserRouter>
          <BiometricLockOverlay />
        </BrowserRouter>,
      );

      expect(screen.getByTestId("biometric-lock-overlay")).toBeDefined();
      expect(screen.getByText("أحمد علي")).toBeDefined();
      expect(screen.getByText("إعادة المحاولة بالبصمة")).toBeDefined();

      const retryBtn = screen.getByText("إعادة المحاولة بالبصمة");
      await act(async () => {
        fireEvent.click(retryBtn);
      });
      expect(mockBiometricContext.unlockWithBiometrics).toHaveBeenCalled();
    });

    it("switches to PIN keypad mode and handles keypad clicks", async () => {
      mockBiometricContext.isLocked = true;
      mockBiometricContext.isPrivacyMaskActive = false;
      mockBiometricContext.hasPin = true;

      render(
        <BrowserRouter>
          <BiometricLockOverlay />
        </BrowserRouter>,
      );

      const pinBtn = screen.getByText("استخدام رمز PIN للطوارئ");
      fireEvent.click(pinBtn);

      expect(screen.getByText("أدخل رمز PIN المكون من 4 أرقام")).toBeDefined();

      // Click digits 1, 2, 3, 4
      fireEvent.click(screen.getByText("1"));
      fireEvent.click(screen.getByText("2"));
      fireEvent.click(screen.getByText("3"));
      await act(async () => {
        fireEvent.click(screen.getByText("4"));
      });

      expect(mockBiometricContext.unlockWithPin).toHaveBeenCalledWith("1234");
    });

    it("normalizes Arabic-Indic digits typed into PIN input field", async () => {
      mockBiometricContext.isLocked = true;
      mockBiometricContext.isPrivacyMaskActive = false;
      mockBiometricContext.hasPin = true;

      render(
        <BrowserRouter>
          <BiometricLockOverlay />
        </BrowserRouter>,
      );

      const pinBtn = screen.getByText("استخدام رمز PIN للطوارئ");
      fireEvent.click(pinBtn);

      const input = document.querySelector('input[type="password"]') as HTMLInputElement;
      expect(input).not.toBeNull();

      await act(async () => {
        fireEvent.change(input, { target: { value: "١٢٣٤" } });
      });

      expect(mockBiometricContext.unlockWithPin).toHaveBeenCalledWith("1234");
    });
  });
});
