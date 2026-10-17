import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { BIOMETRIC_PROMPT_SHOWN_KEY, SIGN_UP_SESSION_KEY } from "@/lib/biometricAuth";

export function PushNotificationPrompt() {
  const { subscribeToPush } = usePushNotifications();
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      const dismissedTime = localStorage.getItem(
        "smartspend_push_prompt_dismissed",
      );
      const isCoolDownOver =
        !dismissedTime ||
        Date.now() - Number(dismissedTime) > 7 * 24 * 60 * 60 * 1000;

      if (isCoolDownOver) {
        const timer = setTimeout(() => {
          // Never in the sign-up session, and never on top of or right after the fingerprint suggestion.
          let skipThisSession = false;
          try {
            skipThisSession =
              sessionStorage.getItem(SIGN_UP_SESSION_KEY) === "1" ||
              sessionStorage.getItem(BIOMETRIC_PROMPT_SHOWN_KEY) === "1";
          } catch {
            // Without session storage both may appear; nothing breaks.
          }
          if (!skipThisSession) setShowPushPrompt(true);
        }, 8000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleEnablePush = async () => {
    setShowPushPrompt(false);
    try {
      await subscribeToPush();
    } catch (err) {
      console.error(err);
      toast.error("ماقدرناش نفعّل الإشعارات. جرّب تاني.");
    }
  };

  const handleDismissPush = () => {
    setShowPushPrompt(false);
    localStorage.setItem(
      "smartspend_push_prompt_dismissed",
      String(Date.now()),
    );
  };

  if (!showPushPrompt || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismissPush();
      }}
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200 ease-out">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
            <Bell className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            فعّل الإشعارات
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            هيوصلك تنبيه لما ميزانية تقرّب تخلص أو تعدّي الحد، وتذكيرات خطتك.
          </p>
        </div>

        <div className="space-y-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-300 text-right">
            <p className="font-bold text-xs">تنبيهات الميزانية</p>
            <p className="text-[10px] text-slate-400">
              بننبهك لما فئة تقرّب من حدها أو لما صرفك يعدّي دخلك المسجّل.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-300 text-right">
            <p className="font-bold text-xs">تذكير بالتسجيل واشتراكك</p>
            <p className="text-[10px] text-slate-400">
              تذكير هادي لو نسيت تسجّل مصاريفك، وتنبيه قبل ما اشتراكك يخلص.
            </p>
          </div>
        </div>

        <div className="pt-1 flex flex-col gap-2">
          <Button
            onClick={handleEnablePush}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 rounded-xl py-2.5 font-bold text-xs shadow-md active-press"
          >
            فعّل الإشعارات
          </Button>
          <button
            onClick={handleDismissPush}
            className="w-full text-center py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            مش دلوقتي
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
