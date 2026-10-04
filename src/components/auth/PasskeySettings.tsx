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
  ShieldCheck,
  Loader2,
  Lock,
  KeyRound,
  Clock,
  Laptop,
  Check,
  AlertCircle,
  Trash2,
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<"enable_lock" | "change_pin">(
    "enable_lock",
  );
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
  const deletePasskeyMutation = trpc.webauthn.deletePasskey.useMutation();

  const handleRegisterPasskey = async () => {
    try {
      setIsRegistering(true);

      // 1. Get options from server
      const options = await generateOptionsMutation.mutateAsync();

      // 2. Start biometric prompt in browser
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options });
      } catch (err) {
        const error = err as Error;
        if (error.name === "InvalidStateError") {
          toast.error("البصمة مسجلة بالفعل على هذا الجهاز");
        } else if (error.name === "NotAllowedError") {
          toast.info("تم إلغاء تسجيل البصمة");
        } else {
          toast.error("ماقدرناش نسجل البصمة. اتأكد من تفعيل البصمة في جهازك وجرّب تاني.");
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
      } catch {
        // Storage access might fail in private browsing
      }

      await utils.webauthn.checkHasPasskey.invalidate();
      toast.success("تم تفعيل الدخول بالبصمة بنجاح! 🎉");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "حصل خطأ أثناء تفعيل البصمة، جرّب تاني");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async () => {
    if (!window.confirm("متأكد إنك عايز توقف الدخول بالبصمة لهذا الحساب؟")) {
      return;
    }

    try {
      setIsDeleting(true);
      await deletePasskeyMutation.mutateAsync();

      try {
        localStorage.removeItem("smartspend_has_passkey");
        if (userKey) {
          localStorage.removeItem(`smartspend_has_passkey_${userKey}`);
        }
      } catch {
        // Storage access might fail in private browsing
      }

      await utils.webauthn.checkHasPasskey.invalidate();
      toast.info("تم إيقاف الدخول بالبصمة لهذا الحساب");
    } catch {
      toast.error("ماقدرناش نحذف البصمة، جرّب تاني");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleLock = async (checked: boolean) => {
    if (checked) {
      if (!hasPin) {
        setPinPurpose("enable_lock");
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

  const handleOpenChangePinDialog = () => {
    setPinPurpose("change_pin");
    setPinValue("");
    setConfirmPinValue("");
    setPinError(null);
    setIsPinDialogOpen(true);
  };

  const handleSavePin = async () => {
    if (pinValue.length !== 4) {
      setPinError("رمز PIN لازم يكون 4 أرقام بالظبط");
      return;
    }
    if (pinValue !== confirmPinValue) {
      setPinError("رمز PIN وتأكيده مش متطابقين");
      return;
    }

    const enteredPin = pinValue;
    await setPin(enteredPin);
    setIsPinDialogOpen(false);
    setPinValue("");
    setConfirmPinValue("");
    setPinError(null);

    if (pinPurpose === "enable_lock") {
      await enableLock(enteredPin);
      toast.success("تم تفعيل قفل التطبيق وتعيين رمز PIN الاحتياطي");
    } else {
      toast.success("تم تحديث رمز PIN الاحتياطي بنجاح");
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Card 1: Passkey Quick Login */}
      <div
        ref={cardRef}
        className={`bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border transition-all duration-300 ${
          isHighlighted
            ? "border-indigo-500/80 ring-2 ring-indigo-500/20 shadow-indigo-500/5 bg-indigo-50/[0.03]"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        {isHighlighted && (
          <div className="mb-4 flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 px-3.5 py-1.5 rounded-full w-fit">
            <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>تم التوجيه لتفعيل أمان البصمة</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
            <Fingerprint className="w-6 h-6" />
          </div>

          <div className="flex-1 space-y-1.5 w-full">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                الدخول ببصمة الإصبع أو الوجه (Face ID / Passkey)
              </h3>
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              سجّل دخولك لحسابك وأكّد هويتك بسرعة وأمان باستخدام بصمة هذا الجهاز، دون الحاجة لكتابة كلمة المرور في كل مرة.
            </p>

            <div className="pt-3">
              {hasPasskey ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        البصمة مفعلة بنجاح على هذا الحساب
                      </p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                        يمكنك استخدامها لتسجيل الدخول السريع وتأكيد هويتك على هذا الجهاز
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegisterPasskey}
                      disabled={isRegistering || isDeleting}
                      className="rounded-xl text-xs font-bold h-9 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/50 shrink-0"
                    >
                      {isRegistering ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />
                      ) : (
                        <Fingerprint className="w-3.5 h-3.5 me-1.5" />
                      )}
                      إعادة ربط البصمة
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeletePasskey}
                      disabled={isRegistering || isDeleting}
                      className="rounded-xl text-xs font-semibold h-9 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0 gap-1.5"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      إلغاء التفعيل
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleRegisterPasskey}
                    disabled={isRegistering}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-600/20 px-6 gap-2 font-bold h-11 transition-all active:scale-[0.99]"
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
                  <p className="text-[11px] text-slate-400">
                    مشفر ومحمي عبر نظام التشغيل في جهازك (Apple Keychain / Google Passkey).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Local App Lock */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                قفل التطبيق المحلي <bdi dir="ltr">(App Lock)</bdi>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">
                طلب البصمة فور فتح التطبيق أو العودة إليه، مع تمويه الشاشة لحماية خصوصيتك
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
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
          <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            {/* Grace period selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    فترة السماح قبل إعادة القفل
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    المدة المسموحة بعد مغادرة التطبيق قبل طلب البصمة مجدداً
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap" dir="ltr">
                {[
                  { label: "فوري", val: 0 },
                  { label: "15 ثانية", val: 15000 },
                  { label: "30 ثانية", val: 30000 },
                  { label: "دقيقة واحدة", val: 60000 },
                  { label: "5 دقائق", val: 300000 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setGracePeriod(item.val)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                      gracePeriod === item.val
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency PIN setup / update */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    رمز PIN الاحتياطي للطوارئ
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {hasPin ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          تم تعيين رمز PIN للطوارئ (4 أرقام)
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                          لم يتم تعيين رمز احتياطي بعد
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenChangePinDialog}
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
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100/60 dark:border-indigo-900/40 flex items-center justify-center text-indigo-500 shrink-0 mt-0.5">
          <Laptop className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            عزل وحماية كاملة لكل جهاز
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
            إعدادات قفل التطبيق بالبصمة ورمز PIN مشفرة ومحفوظة محلياً على هذا الجهاز فقط، ولن تؤثر على استخدامك لحسابك من أجهزتك الأخرى.
          </p>
        </div>
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
        <DialogContent className="sm:max-w-md rounded-3xl" dir="rtl">
          <DialogHeader className="text-start">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2">
              <KeyRound className="w-5 h-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
              {pinPurpose === "enable_lock"
                ? "تعيين رمز PIN احتياطي لقفل التطبيق"
                : "تغيير رمز PIN الاحتياطي"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed mt-1">
              عيّن رمزاً مكوناً من 4 أرقام كخيار احتياطي لإلغاء قفل التطبيق في حال عدم استجابة البصمة.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                رمز PIN الجديد (4 أرقام):
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
                className="w-full text-center tracking-[0.8em] text-xl font-bold h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
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
                className="w-full text-center tracking-[0.8em] text-xl font-bold h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {pinError && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-normal">
              🔒 الرمز مشفر ومحفوظ محلياً على هذا الجهاز فقط ولا يُشارك عبر الإنترنت.
            </p>
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
              onClick={handleSavePin}
              disabled={pinValue.length !== 4 || confirmPinValue.length !== 4}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              {pinPurpose === "enable_lock" ? "تفعيل قفل التطبيق" : "حفظ رمز PIN الجديد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
