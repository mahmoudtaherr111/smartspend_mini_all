import { useEffect, useState } from "react";
import { Download, Share, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalonePwa,
  triggerInstallPrompt,
} from "@/pwa/register-sw";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "smartspend_pwa_install_dismissed_v2";

export function PwaEnhancements() {
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isReadyToShow, setIsReadyToShow] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Connection states
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [showNetworkStatus, setShowNetworkStatus] = useState(false);

  useEffect(() => {
    if (isStandalonePwa()) return;

    // Delay the prompt by 5 seconds so it doesn't annoy the user immediately on first load
    const timer = setTimeout(() => {
      setIsReadyToShow(true);
    }, 5000);

    const sync = () => setCanInstall(!!getDeferredInstallPrompt());
    sync();
    window.addEventListener("pwa-install-available", sync);

    if (isIosSafari() && !dismissed) {
      setShowIosHint(true);
    }

    return () => {
      window.removeEventListener("pwa-install-available", sync);
      clearTimeout(timer);
    };
  }, [dismissed]);

  // Premium PWA App Badging
  useEffect(() => {
    if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
      try {
        navigator.clearAppBadge().catch(() => {});
      } catch (e) {}
    }
  }, []);

  // Connection status listener
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handleOnline = () => {
      if (timer) clearTimeout(timer);
      setIsOnline(true);
      setShowNetworkStatus(true);
      timer = setTimeout(() => setShowNetworkStatus(false), 3500);
    };

    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      setIsOnline(false);
      setShowNetworkStatus(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Background Sync completion listener
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "OFFLINE_SYNC_SUCCESS") {
        import("sonner").then(({ toast }) => {
          toast.success("تمت مزامنة العمليات بنجاح", {
            description: "تم رفع المصاريف اللي سجلتها بدون إنترنت.",
          });
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setShowIosHint(false);
    setCanInstall(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const showInstallCard =
    isReadyToShow &&
    !isStandalonePwa() &&
    !dismissed &&
    (canInstall || showIosHint);

  return (
    <>
      {/* Network Status Toast */}
      {showNetworkStatus && (
        <div
          className={cn(
            "fixed top-4 left-4 right-4 z-[9999] max-w-sm mx-auto rounded-2xl p-3 flex items-center gap-3 border shadow-lg backdrop-blur-2xl animate-in slide-in-from-top duration-500",
            isOnline
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
              : "bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-300",
          )}
          dir="rtl"
        >
          <div
            className={cn(
              "h-8 w-8 rounded-xl flex items-center justify-center border shrink-0",
              isOnline
                ? "bg-emerald-500/20 border-emerald-500/30"
                : "bg-amber-500/20 border-amber-500/30",
            )}
          >
            {isOnline ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-600 dark:text-emerald-400"
              >
                <path d="M12 20h.01" />
                <path d="M8.5 16.5c3.5-3.5 6.5-3.5 10 0" />
                <path d="M5 13c5-5 9-5 14 0" />
                <path d="M2 9.5c7-7 13-7 20 0" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-amber-600 dark:text-amber-400"
              >
                <path d="M1 1l22 22" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 13" />
                <path d="M5 13a10.94 10.94 0 0 1 5.83-2.84" />
                <path d="M12 20h.01" />
                <path d="M8.5 16.5a4.92 4.92 0 0 1 4.24-1.44" />
                <path d="M22 9.5A19.86 19.86 0 0 0 12 7c-2.3 0-4.5.42-6.55 1.18" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-bold leading-tight">
              {isOnline ? "تمت العودة للإنترنت" : "بدون اتصال بالإنترنت"}
            </p>
            <p className="text-[11px] opacity-80 mt-0.5 leading-normal">
              {isOnline
                ? "تمت مزامنة بياناتك بنجاح."
                : "سيتم حفظ العمليات محلياً لحين الاتصال."}
            </p>
          </div>
        </div>
      )}

      {/* App Installation Premium Banner */}
      {showInstallCard && (
        <div
          className={cn(
            "lg:hidden fixed left-3 right-3 z-[100]",
            // Positioned right above the mobile bottom nav with smooth entry
            "bottom-[calc(5rem+env(safe-area-inset-bottom))]",
            "animate-in slide-in-from-bottom-8 fade-in duration-700 ease-out",
          )}
          role="region"
          aria-label="تثبيت التطبيق"
          dir="rtl"
        >
          {canInstall && (
            <div className="relative overflow-hidden rounded-3xl border border-white/40 dark:border-slate-700/50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.5)] p-4 transition-all">
              {/* Premium Gradient Top Border */}
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 opacity-80" />

              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/30">
                  <Download className="w-7 h-7" />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-start">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide">
                      تطبيق SmartSpend
                    </h3>
                    <button
                      type="button"
                      onClick={dismiss}
                      className="tap-target -mt-1 -mr-2 h-8 w-8 shrink-0 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 transition-colors"
                      aria-label="إغلاق"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    تجربة أسرع بدون إنترنت، وتنبيهات ذكية فورية.
                  </p>
                  <Button
                    className="w-full mt-3 h-11 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-bold text-[15px] shadow-md transition-transform active:scale-[0.98]"
                    onClick={() =>
                      void triggerInstallPrompt().then((ok) => ok && dismiss())
                    }
                  >
                    تثبيت التطبيق الآن
                  </Button>
                </div>
              </div>
            </div>
          )}

          {showIosHint && !canInstall && (
            <div className="relative overflow-hidden rounded-3xl border border-white/40 dark:border-slate-700/50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.5)] p-4 transition-all">
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500 opacity-80" />

              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/30">
                  <Share className="w-7 h-7" />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-start">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-wide">
                      أضف لشاشتك الرئيسية
                    </h3>
                    <button
                      type="button"
                      onClick={dismiss}
                      className="tap-target -mt-1 -mr-2 h-8 w-8 shrink-0 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 transition-colors"
                      aria-label="إغلاق"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    اضغط على زر{" "}
                    <strong className="text-slate-900 dark:text-white">
                      المشاركة
                    </strong>{" "}
                    في متصفح Safari بالأسفل لاستمتاع بتجربة التطبيق الكاملة.
                  </p>
                  <div className="w-full mt-3 h-11 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex items-center justify-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                    <span>ثم اختر إضافة للشاشة</span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Bouncy arrow pointing down to the Safari share button */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex justify-center w-full pointer-events-none opacity-60">
                <ChevronDown className="w-8 h-8 text-slate-400 dark:text-slate-500 animate-bounce" />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
