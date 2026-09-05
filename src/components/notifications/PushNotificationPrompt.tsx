import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

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
          setShowPushPrompt(true);
        }, 8000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleEnablePush = async () => {
    setShowPushPrompt(false);
    try {
      await subscribeToPush();
      toast.success("تم تفعيل التنبيهات الذكية بنجاح! 🔔");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء تفعيل التنبيهات.");
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
            <span className="text-2xl">🔔</span>
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            فَعّل التنبيهات المالية الذكية
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            تابع مصاريفك أسبوعياً، واحصل على نصائح تحليلات الذكاء الاصطناعي
            لميزانيتك وتذكير يومي لتسجيل مصاريفك بصوتك.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-base">🎯</span>
            <div className="text-right">
              <p className="font-bold text-xs">تذكير التسجيل اليومي</p>
              <p className="text-[10px] text-slate-400">
                تذكيرك في نهاية اليوم لتسجيل معاملاتك بصوتك في ثوانٍ.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-base">💡</span>
            <div className="text-right">
              <p className="font-bold text-xs">تحليلات وتنبيهات فورية</p>
              <p className="text-[10px] text-slate-400">
                تنبيه فوري عند تخطي ميزانية الفئات أو حدوث نمط صرف شاذ.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-1 flex flex-col gap-2">
          <Button
            onClick={handleEnablePush}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 rounded-xl py-2.5 font-bold text-xs shadow-md active-press"
          >
            تفعيل التنبيهات الآن
          </Button>
          <button
            onClick={handleDismissPush}
            className="w-full text-center py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            ليس الآن، تذكيري لاحقاً
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
