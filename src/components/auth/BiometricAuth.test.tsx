/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { BiometricOnboardingModal } from "./BiometricOnboardingModal";
import { BiometricLockOverlay } from "./BiometricLockOverlay";

// Mock router navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock BiometricLockProvider
const mockBiometricContext = {
  isLocked: false,
  isPrivacyMaskActive: false,
  hasPin: true,
  isAuthenticating: false,
  lastAuthResult: null,
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
