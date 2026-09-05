import React, { useState, useEffect, useRef } from "react";
import { useBiometricLock } from "@/providers/BiometricLockProvider";
import { useAuth } from "@/hooks/useAuth";
import { useHaptics } from "@/hooks/useHaptics";
import {
  getUserStorageKey,
  normalizeDigits,
  getPinLockoutRemainingMs,
} from "@/lib/biometricAuth";
import {
  Fingerprint,
  Lock,
  KeyRound,
  RefreshCw,
  User as UserIcon,
  AlertCircle,
  LogOut,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export function BiometricLockOverlay() {
  const {
    isLocked,
    isPrivacyMaskActive,
    hasPin,
    isAuthenticating,
    lastAuthResult,
    unlockWithBiometrics,
    unlockWithPin,
  } = useBiometricLock();

  const { user, logout } = useAuth();
  const userKey = getUserStorageKey(user);
  const {
    lightTap,
    mediumTap,
    error: hapticError,
    success: hapticSuccess,
  } = useHaptics();

  const [mode, setMode] = useState<"biometric" | "pin">("biometric");
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(() => {
    const ms = getPinLockoutRemainingMs(userKey);
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  });
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Sync lockout timer countdown
  useEffect(() => {
    const updateLockout = () => {
      const remainingMs = getPinLockoutRemainingMs(userKey);
      const sec = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
      setLockoutRemainingSec(sec);
    };

    updateLockout();
    const interval = setInterval(updateLockout, 1000);
    return () => clearInterval(interval);
  }, [userKey, isLocked, mode]);

  // Reset PIN input when entering/exiting PIN mode or locked state
  useEffect(() => {
    if (!isLocked) {
      setMode("biometric");
      setPinInput("");
      setPinError(null);
    }
  }, [isLocked]);

  useEffect(() => {
    if (mode === "pin") {
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
    }
  }, [mode]);

  // Handle PIN input change & auto-submit on 4 digits
  const handlePinChange = async (val: string) => {
    if (lockoutRemainingSec > 0) return;
    const normalized = normalizeDigits(val);
    const clean = normalized.replace(/\D/g, "").slice(0, 4);
    setPinInput(clean);
    setPinError(null);

    if (clean.length === 4) {
      setIsVerifyingPin(true);
      const isSuccess = await unlockWithPin(clean);
      setIsVerifyingPin(false);
      if (isSuccess) {
        hapticSuccess();
      } else {
        hapticError();
        const remMs = getPinLockoutRemainingMs(userKey);
        if (remMs > 0) {
          const sec = Math.ceil(remMs / 1000);
          setLockoutRemainingSec(sec);
          setPinError(
            `تم إيقاف المحاولات مؤقتاً بسبب تكرار الخطأ. انتظر ${sec} ثانية`,
          );
        } else {
          setPinError("رمز PIN غير صحيح");
        }
        setPinInput("");
      }
    }
  };

  const handleRetryBiometrics = async () => {
    mediumTap();
    setMode("biometric");
    const res = await unlockWithBiometrics();
    if (res.success) {
      hapticSuccess();
    } else {
      hapticError();
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (lockoutRemainingSec > 0 || isVerifyingPin) return;
    lightTap();
    if (pinInput.length < 4) {
      handlePinChange(pinInput + digit);
    }
  };

  const handleKeypadDelete = () => {
    if (lockoutRemainingSec > 0 || isVerifyingPin) return;
    lightTap();
    if (pinInput.length > 0) {
      handlePinChange(pinInput.slice(0, -1));
    }
  };

  // 1. Privacy Masking during OS app switcher / multitasking
  if (isPrivacyMaskActive && !isLocked) {
    return (
      <div
        className="fixed inset-0 z-50 bg-[#07090E]/95 backdrop-blur-3xl flex flex-col items-center justify-center pointer-events-auto select-none"
        dir="rtl"
        aria-hidden="true"
      >
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-2xl shadow-indigo-500/20">
            <Shield className="w-8 h-8" />
          </div>
          <p className="text-sm font-black tracking-wider text-slate-300">
            SmartSpend AI
          </p>
        </div>
      </div>
    );
  }

  // 2. Not locked: render nothing
  if (!isLocked) return null;

  const keypadLetters: Record<string, string> = {
    "1": "",
    "2": "ABC",
    "3": "DEF",
    "4": "GHI",
    "5": "JKL",
    "6": "MNO",
    "7": "PQRS",
    "8": "TUV",
    "9": "WXYZ",
    "0": "+",
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#07090E] text-white flex flex-col items-center justify-between p-6 sm:p-8 select-none overflow-hidden"
      dir="rtl"
      data-testid="biometric-lock-overlay"
    >
      {/* Luxury Ambient Glows */}
      <div className="absolute -top-40 -start-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -end-40 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <div className="w-full flex items-center justify-between pt-safe relative z-10">
        <div className="flex items-center gap-2 text-indigo-300 text-xs font-black bg-indigo-950/40 border border-indigo-500/20 px-3.5 py-1.5 rounded-full backdrop-blur-md shadow-lg shadow-indigo-950/50">
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          <span>SmartSpend Shield • قفل الأمان</span>
        </div>
        <button
          type="button"
          onClick={() => {
            mediumTap();
            void logout();
          }}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 px-3 py-1.5 rounded-full transition-colors backdrop-blur-md"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>

      {/* Main Center Area */}
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-6 my-auto relative z-10">
        {/* User Identity Preview */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 opacity-40 blur-sm animate-pulse" />
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-20 h-20 rounded-full object-cover relative z-10 border-2 border-white/20 shadow-2xl"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-white/15 flex items-center justify-center relative z-10 shadow-2xl">
                <UserIcon className="w-10 h-10 text-slate-400" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-black text-white">
              {user?.name || "مستخدم SmartSpend"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              يرجى التحقق للمتابعة واستخدام التطبيق
            </p>
          </div>
        </div>

        {/* Mode 1: Biometric Mode (Face ID / Touch ID Radar) */}
        {mode === "biometric" && (
          <div className="w-full flex flex-col items-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Biometric Interactive Radar Orb */}
            <div className="relative flex items-center justify-center my-2">
              {/* Concentric expanding ripples */}
              {isAuthenticating && (
                <>
                  <div className="absolute w-36 h-36 rounded-full border border-emerald-500/20 animate-ping pointer-events-none" />
                  <div className="absolute w-44 h-44 rounded-full border border-indigo-500/15 animate-pulse pointer-events-none" />
                </>
              )}

              <button
                type="button"
                onClick={handleRetryBiometrics}
                disabled={isAuthenticating}
                className={`group relative flex items-center justify-center w-28 h-28 rounded-full border-2 transition-all duration-500 shadow-2xl active:scale-95 ${
                  isAuthenticating
                    ? "border-emerald-500/60 bg-emerald-500/10 shadow-emerald-500/20"
                    : "border-white/15 hover:border-indigo-500/60 bg-white/[0.03] hover:bg-indigo-500/10 shadow-indigo-500/20"
                }`}
                aria-label="التحقق بالبصمة"
              >
                {/* Rotating Gradient Aura */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/20 via-transparent to-indigo-500/20 animate-spin-slow pointer-events-none" />

                {isAuthenticating ? (
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="w-12 h-12 animate-spin text-emerald-400" />
                  </div>
                ) : (
                  <Fingerprint className="w-14 h-14 text-indigo-400 group-hover:text-emerald-400 transition-all duration-300 group-hover:scale-110" />
                )}
              </button>
            </div>

            {/* Status Message Pill */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isAuthenticating
                      ? "bg-emerald-400 animate-ping"
                      : lastAuthResult && !lastAuthResult.success
                        ? "bg-rose-400"
                        : "bg-indigo-400"
                  }`}
                />
                <p className="text-sm font-black text-slate-200">
                  {isAuthenticating
                    ? "جاري التحقق من بصمة الوجه (Face ID)..."
                    : "المس للمسح بالبصمة أو Face ID"}
                </p>
              </div>

              {lastAuthResult && !lastAuthResult.success && (
                <p className="text-xs text-rose-400 flex items-center justify-center gap-1 font-semibold animate-fadeIn max-w-xs leading-relaxed">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {lastAuthResult.message}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={handleRetryBiometrics}
                disabled={isAuthenticating}
                className="w-full rounded-2xl border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white font-bold h-12 gap-2 shadow-lg backdrop-blur-md transition-all active:scale-98"
              >
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                إعادة المحاولة بالبصمة
              </Button>

              {hasPin && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    mediumTap();
                    setMode("pin");
                  }}
                  className="w-full rounded-2xl text-indigo-300 hover:text-white hover:bg-indigo-950/40 font-bold h-11 gap-2 text-xs transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  استخدام رمز PIN للطوارئ
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Mode 2: Emergency 4-Digit PIN Mode (Apple/Revolut Glass Keypad) */}
        {mode === "pin" && (
          <div className="w-full flex flex-col items-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-1">
              <h3 className="text-base font-black text-white">
                أدخل رمز PIN المكون من 4 أرقام
              </h3>
              <p className="text-xs text-slate-400">
                رمز المرور المحلي للطوارئ لهذا الجهاز
              </p>
            </div>

            {/* Hidden Input for Physical/Software Keyboard */}
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => handlePinChange(e.target.value)}
              className="sr-only"
              autoFocus
            />

            {/* PIN Dots Indicator */}
            <div
              onClick={() => pinInputRef.current?.focus()}
              className="flex items-center justify-center gap-5 my-1 cursor-pointer py-1"
            >
              {[0, 1, 2, 3].map((index) => {
                const filled = pinInput.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      filled
                        ? "bg-indigo-400 scale-125 shadow-lg shadow-indigo-500/80 ring-4 ring-indigo-500/20"
                        : "bg-slate-800/80 border border-white/20"
                    }`}
                  />
                );
              })}
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 flex items-center justify-center gap-1.5 font-bold animate-shake bg-rose-950/40 border border-rose-800/40 px-3 py-1.5 rounded-full">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {pinError}
              </p>
            )}

            {/* Circular Apple-Style Glass Keypad (3x4) */}
            <div
              className="grid grid-cols-3 gap-x-4 gap-y-3 w-full max-w-[280px] pt-1"
              dir="ltr"
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeypadPress(digit)}
                  disabled={isVerifyingPin || lockoutRemainingSec > 0}
                  className="w-18 h-18 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] active:scale-90 active:bg-indigo-500/25 active:border-indigo-500/40 flex flex-col items-center justify-center shadow-lg transition-all duration-150 backdrop-blur-md disabled:opacity-30 disabled:pointer-events-none mx-auto"
                >
                  <span className="text-2xl font-bold text-white leading-none">
                    {digit}
                  </span>
                  {keypadLetters[digit] && (
                    <span className="text-[9px] font-black tracking-widest text-slate-400/80 leading-none mt-0.5">
                      {keypadLetters[digit]}
                    </span>
                  )}
                </button>
              ))}

              {/* Empty slot for spacing */}
              <div />

              {/* Digit 0 */}
              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                disabled={isVerifyingPin || lockoutRemainingSec > 0}
                className="w-18 h-18 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] active:scale-90 active:bg-indigo-500/25 active:border-indigo-500/40 flex flex-col items-center justify-center shadow-lg transition-all duration-150 backdrop-blur-md disabled:opacity-30 disabled:pointer-events-none mx-auto"
              >
                <span className="text-2xl font-bold text-white leading-none">
                  0
                </span>
                <span className="text-[9px] font-black tracking-widest text-slate-400/80 leading-none mt-0.5">
                  +
                </span>
              </button>

              {/* Delete / Backspace button */}
              <button
                type="button"
                onClick={handleKeypadDelete}
                disabled={isVerifyingPin || lockoutRemainingSec > 0}
                className="w-18 h-18 rounded-full bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] active:scale-90 flex items-center justify-center shadow-md transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none mx-auto text-slate-400 hover:text-white"
                aria-label="مسح"
              >
                <span className="text-xs font-bold">مسح</span>
              </button>
            </div>

            {/* Back to Biometric Mode Button */}
            <Button
              variant="ghost"
              onClick={() => {
                mediumTap();
                setMode("biometric");
              }}
              className="w-full text-indigo-300 hover:text-white hover:bg-indigo-950/40 text-xs font-bold h-10 gap-2 rounded-2xl"
            >
              <Fingerprint className="w-4 h-4 text-indigo-400" />
              الرجوع للدخول بالبصمة
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Footer */}
      <div className="w-full text-center pb-safe relative z-10">
        <p className="text-[11px] text-slate-500 font-medium">
          حماية أمنية مشفرة محلياً 100% بدون إرسال أي بيانات عبر الإنترنت
        </p>
      </div>
    </div>
  );
}
