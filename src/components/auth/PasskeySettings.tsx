import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getUserStorageKey, normalizeDigits } from "@/lib/biometricAuth";
import {
  Fingerprint,
  CheckCircle2,
  Shield,
  Loader2,
  Lock,
  KeyRound,
  Clock,
  Laptop,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useBiometricLock } from "@/providers/BiometricLockProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function PasskeySettings() {
  const { user } = useAuth();
  const userKey = getUserStorageKey(user);
  const [searchParams] = useSearchParams();
  const isHighlighted = searchParams.get("highlight") === "1";
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  const [isRegistering, setIsRegistering] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [confirmPinValue, setConfirmPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: passkeyInfo } = trpc.webauthn.checkHasPasskey.useQuery();
  const hasPasskey = !!passkeyInfo?.hasPasskey;

  const {
    isLockEnabled,
    hasPin,
    gracePeriod,
    enableLock,
    disableLock,
    setPin,
    setGracePeriod,
  } = useBiometricLock();

  const generateOptionsMutation =
    trpc.webauthn.generateRegistrationOptions.useMutation();
  const verifyRegistrationMutation =
    trpc.webauthn.verifyRegistration.useMutation();

  const handleStartActivation = () => {
    if (!hasPin) {
      setIsPinDialogOpen(true);
    } else {
      void handleRegisterPasskey();
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      setIsRegistering(true);

      // 1. Get options from server
      const options = await generateOptionsMutation.mutateAsync();

      // 2. Start biometric prompt in browser
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options });
      } catch (error: any) {
        if (error.name === "InvalidStateError") {
          toast.error("البصمة مسجلة مسبقاً على هذا الجهاز");
        } else {
          toast.error("فشل تسجيل البصمة. تأكد من تفعيل البصمة في جهازك.");
        }
        return;
      }

      // 3. Send response to server for verification
      await verifyRegistrationMutation.mutateAsync({ response: attResp });

      try {
        localStorage.setItem("smartspend_has_passkey", "1");
        if (userKey) {
          localStorage.setItem(`smartspend_has_passkey_${userKey}`, "1");
        }
      } catch (e) {
        console.error("Failed to write has_passkey to localStorage", e);
      }

      // Auto-enable app lock on this device
      await enableLock();
      utils.webauthn.checkHasPasskey.invalidate();
      toast.success("تم تفعيل الدخول وقفل التطبيق بالبصمة ورمز PIN بنجاح! 🎉");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "حدث خطأ غير متوقع أثناء تفعيل البصمة");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleToggleLock = async (checked: boolean) => {
    if (checked) {
      if (!hasPin) {
        setIsPinDialogOpen(true);
      } else {
        await enableLock();
        toast.success("تم تفعيل قفل التطبيق بالبصمة");
      }
    } else {
      disableLock();
      toast.info("تم تعطيل قفل التطبيق");
    }
  };

  const handleSavePinAndProceed = async () => {
    if (pinValue.length !== 4) {
      setPinError("يجب أن يتكون رمز PIN من 4 أرقام بالضبط");
      return;
    }
    if (pinValue !== confirmPinValue) {
      setPinError("رمز PIN وتأكيده غير متطابقين");
      return;
    }

    const enteredPin = pinValue;
    await setPin(enteredPin);
    setIsPinDialogOpen(false);
    setPinValue("");
    setConfirmPinValue("");
    setPinError(null);

    // If user doesn't have passkey yet, trigger registration immediately
    if (!hasPasskey) {
      await handleRegisterPasskey();
    } else {
      await enableLock(enteredPin);
      toast.success("تم حفظ رمز PIN وتفعيل قفل التطبيق بنجاح");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Card 1: Passkey Quick Login */}
      <div
        ref={cardRef}
        className={`bg-white dark:bg-slate-900/50 rounded-3xl p-6 shadow-sm border relative overflow-hidden transition-all duration-500 ${
          isHighlighted
            ? "border-indigo-500 ring-4 ring-indigo-500/20 shadow-indigo-500/10 scale-[1.01]"
            : "border-slate-200/60 dark:border-slate-800"
        }`}
      >
        {isHighlighted && (
          <div className="mb-4 flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 rounded-full w-fit animate-bounce">
            <Sparkles className="w-3.5 h-3.5" />
            <span>جاهز للتفعيل بنقرة واحدة ⚡</span>
          </div>
        )}

        <div className="flex gap-4 relative z-10">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400">
            <Fingerprint className="w-6 h-6" />
          </div>

          <div className="flex-1 space-y-1">
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              الدخول بالبصمة ومفتاح المرور
              <Shield className="w-4 h-4 text-emerald-500" />
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              ادخل لحسابك بطريقة أسرع وآمنة جداً باستخدام بصمة صباعك أو بصمة الوجه
              (Face ID) من غير ما تحتاج تفتكر كلمة السر.
            </p>

            <div className="pt-4">
              {hasPasskey ? (
                <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/50 w-fit">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-bold text-sm">
                    البصمة مفعلة بنجاح على هذا الحساب
                  </span>
                </div>
              ) : (
                <Button
                  onClick={handleStartActivation}
                  disabled={isRegistering}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/20 px-6 gap-2 font-bold h-11"
                >
                  {isRegistering ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4 h-4" />
                  )}
                  {isRegistering
                    ? "جاري تفعيل البصمة..."
                    : "تفعيل الدخول بالبصمة الآن"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Zero-Latency Local App Lock */}
      <div className="bg-white dark:bg-slate-900/50 rounded-3xl p-6 shadow-sm border border-slate-200/60 dark:border-slate-800 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                قفل التطبيق المحلي <bdi dir="ltr">(App Lock)</bdi>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                طلب البصمة فور فتح أو استئناف التطبيق مع إخفاء الشاشة في الخلفية
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isLockEnabled}
              onChange={(e) => handleToggleLock(e.target.checked)}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Configuration sub-options when lock is enabled */}
        {isLockEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* Grace period selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-500" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    فترة السماح قبل إعادة القفل (Grace Period)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    عدم طلب البصمة عند التبديل السريع بين التطبيقات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5" dir="ltr">
                {[
                  { label: "15 ثانية", val: 15000 },
                  { label: "30 ثانية", val: 30000 },
                  { label: "1 دقيقة", val: 60000 },
                  { label: "5 دقائق", val: 300000 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setGracePeriod(item.val)}
                    className={`text-xs px-2.5 py-1.5 rounded-xl font-bold transition-all ${
                      gracePeriod === item.val
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency PIN setup / update */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    رمز PIN المحلي للطوارئ
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {hasPin ? "تم تعيين رمز PIN للطوارئ" : "لم يتم تعيين رمز PIN بعد"}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPinDialogOpen(true)}
                className="rounded-xl text-xs font-bold h-9 gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {hasPin ? "تغيير رمز PIN" : "تعيين رمز PIN"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Card 3: Device-Scoped Isolation Notice */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/80 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-500 shrink-0">
          <Laptop className="w-4 h-4" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          🔒 <strong className="text-slate-700 dark:text-slate-300">عزل تام لكل جهاز:</strong>{" "}
          إعدادات القفل بالبصمة ورمز PIN محفوظة على هذا الجهاز فقط، ولن تؤثر على تجربة استخدامك من
          أجهزتك الأخرى.
        </p>
      </div>

      {/* 4-Digit PIN Configuration Dialog */}
      <Dialog
        open={isPinDialogOpen}
        onOpenChange={(open) => {
          setIsPinDialogOpen(open);
          if (!open) {
            setPinValue("");
            setConfirmPinValue("");
            setPinError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-500" />
              تعيين رمز PIN المحلي للطوارئ
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              يستخدم هذا الرمز لإلغاء القفل في حالة عدم استجابة البصمة أو عند الرغبة في الدخول اليدوي.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                أدخل رمز PIN جديد (4 أرقام):
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinValue}
                onChange={(e) =>
                  setPinValue(normalizeDigits(e.target.value).replace(/\D/g, "").slice(0, 4))
                }
                placeholder="••••"
                className="w-full text-center tracking-[1em] text-lg font-black h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                تأكيد رمز PIN:
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPinValue}
                onChange={(e) =>
                  setConfirmPinValue(
                    normalizeDigits(e.target.value).replace(/\D/g, "").slice(0, 4),
                  )
                }
                placeholder="••••"
                className="w-full text-center tracking-[1em] text-lg font-black h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            {pinError && (
              <p className="text-xs text-rose-500 font-bold text-center">{pinError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsPinDialogOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleSavePinAndProceed}
              disabled={pinValue.length !== 4 || confirmPinValue.length !== 4 || isRegistering}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold gap-2"
            >
              {isRegistering ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {hasPasskey ? "حفظ رمز PIN" : "متابعة لتفعيل البصمة (Face ID)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
