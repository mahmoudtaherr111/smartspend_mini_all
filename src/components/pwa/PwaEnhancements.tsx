import { useEffect, useState } from "react";
import { Download, Share, X, ChevronDown, RefreshCw, Trash2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalonePwa,
  triggerInstallPrompt,
} from "@/pwa/register-sw";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { toast } from "sonner";

const DISMISS_KEY = "smartspend_pwa_install_dismissed_v2";

export function PwaEnhancements() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
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

  // Offline outbox queue sync manager states
  const [pendingTexts, setPendingTexts] = useState<any[]>([]);
  const [pendingManual, setPendingManual] = useState<any[]>([]);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadQueues = () => {
    try {
      const texts = JSON.parse(localStorage.getItem("smartspend_offline_texts") || "[]");
      const manual = JSON.parse(localStorage.getItem("smartspend_offline_manual") || "[]");
      setPendingTexts(texts);
      setPendingManual(manual);
    } catch (e) {}
  };

  useEffect(() => {
    loadQueues();
    window.addEventListener("storage", loadQueues);
    const handleSyncFinished = () => {
      setTimeout(loadQueues, 1000);
    };
    window.addEventListener("online", handleSyncFinished);
    window.addEventListener("smartspend-offline-queue-changed", loadQueues);
    return () => {
      window.removeEventListener("storage", loadQueues);
      window.removeEventListener("online", handleSyncFinished);
      window.removeEventListener("smartspend-offline-queue-changed", loadQueues);
    };
  }, []);

  const handleManualSync = () => {
    setIsRetrying(true);
    // ExpenseForm owns the authenticated, visible outbox. Open that screen
    // before asking it to sync; dispatching a synthetic `online` event from a
    // random route previously did nothing when the form was not mounted.
    navigate("/dashboard?tab=record");
    window.setTimeout(() => {
      window.dispatchEvent(new Event("smartspend-offline-sync"));
    }, 150);
    toast.info("جاري فتح صندوق المزامنة ومراجعة العمليات المعلقة...");
    setTimeout(() => {
      loadQueues();
      setIsRetrying(false);
    }, 2500);
  };

  const handleDeleteTextItem = (index: number) => {
    try {
      const texts = JSON.parse(localStorage.getItem("smartspend_offline_texts") || "[]");
      texts.splice(index, 1);
      localStorage.setItem("smartspend_offline_texts", JSON.stringify(texts));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      loadQueues();
      toast.success("تم حذف العملية المعلقة.");
    } catch (e) {}
  };

  const handleDeleteManualItem = (index: number) => {
    try {
      const manual = JSON.parse(localStorage.getItem("smartspend_offline_manual") || "[]");
      manual.splice(index, 1);
      localStorage.setItem("smartspend_offline_manual", JSON.stringify(manual));
      window.dispatchEvent(new Event("smartspend-offline-queue-changed"));
      loadQueues();
      toast.success("تم حذف العملية المعلقة.");
    } catch (e) {}
  };

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

  // Sync PWA status bar style and theme-color meta tags with next-themes dynamically
  useEffect(() => {
    if (typeof document === "undefined") return;

    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    const color = resolvedTheme === "dark" ? "#090d16" : "#f8fafc";
    themeColorMetas.forEach((meta) => {
      meta.setAttribute("content", color);
    });

    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBarMeta) {
      statusBarMeta.setAttribute(
        "content",
        resolvedTheme === "dark" ? "black-translucent" : "default"
      );
    }
  }, [resolvedTheme]);

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

  // Keyboard Avoidance Engine using Visual Viewport API and fast focus listeners
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const root = document.documentElement;

    const handleViewportChange = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      const keyboardHeight = window.innerHeight - viewport.height;
      const isKeyboardOpen = keyboardHeight > 60; // 60px is a safe threshold

      if (isKeyboardOpen) {
        root.classList.add("keyboard-active");
        root.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
        root.style.setProperty("--visual-viewport-height", `${viewport.height}px`);
      } else {
        const activeEl = document.activeElement;
        const isFocusingInput = activeEl && (
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable
        );
        if (!isFocusingInput) {
          root.classList.remove("keyboard-active");
        }
        root.style.setProperty("--keyboard-height", "0px");
        root.style.setProperty("--visual-viewport-height", `${window.innerHeight}px`);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        root.classList.add("keyboard-active");
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        const isStillInput = activeEl && (
          activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable
        );
        if (!isStillInput) {
          root.classList.remove("keyboard-active");
        }
      }, 50);
    };

    window.visualViewport.addEventListener("resize", handleViewportChange);
    window.visualViewport.addEventListener("scroll", handleViewportChange);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      root.classList.remove("keyboard-active");
    };
  }, []);

  // Notification navigation listener. Transaction synchronization is owned by
  // the visible expense outbox, not by the service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "NAVIGATE_TO") {
        try {
          const urlObj = new URL(event.data.url, window.location.origin);
          navigate(urlObj.pathname + urlObj.search + urlObj.hash);
        } catch (e) {
          console.error("Failed to parse navigation URL:", e);
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [navigate]);

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
      {/* Pending Offline Sync Banner */}
      {isOnline && (pendingTexts.length > 0 || pendingManual.length > 0) && (
        <div
          className="fixed top-0 start-0 end-0 z-[10000] bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-center py-2.5 px-4 text-xs font-bold shadow-md flex items-center justify-center gap-3 animate-in slide-in-from-top duration-300"
          dir="rtl"
        >
          <Database className="w-4 h-4 animate-pulse" />
          <span>لديك {pendingTexts.length + pendingManual.length} عمليات مسجلة أوفلاين لم تتم مزامنتها بعد.</span>
          <button
            onClick={() => setShowSyncDialog(true)}
            className="bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded-md font-bold text-[10px] transition-colors active-press"
          >
            مراجعة ومزامنة
          </button>
        </div>
      )}

      {/* Persistent Offline Banner */}
      {!isOnline && (
        <div
          className="fixed top-0 start-0 end-0 z-[10000] bg-gradient-to-r from-amber-600 to-amber-500 text-white text-center py-2 px-4 text-xs font-bold shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
          dir="rtl"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <span>أنت تعمل حالياً دون اتصال بالإنترنت. تم تفعيل الإدخال المبسط وتعطيل العمليات السحابية.</span>
        </div>
      )}

      {/* Network Status Toast */}
      {showNetworkStatus && (
        <div
          className={cn(
            "fixed top-4 start-4 end-4 z-[9999] max-w-sm mx-auto rounded-2xl p-3 flex items-center gap-3 border shadow-lg backdrop-blur-2xl animate-in slide-in-from-top duration-500",
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
          <div className="flex-1 min-w-0 text-end">
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
            "lg:hidden fixed start-3 end-3 z-[100]",
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
                      className="tap-target -mt-1 -me-2 h-8 w-8 shrink-0 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 transition-colors"
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
                      className="tap-target -mt-1 -me-2 h-8 w-8 shrink-0 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400 transition-colors"
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
              <div className="absolute -bottom-4 start-1/2 -translate-x-1/2 flex justify-center w-full pointer-events-none opacity-60">
                <ChevronDown className="w-8 h-8 text-slate-400 dark:text-slate-500 animate-bounce" />
              </div>
            </div>
          )}
        </div>
      )}
      {/* Sync Manager Modal */}
      {showSyncDialog && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" dir="rtl">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">صندوق المزامنة المعلقة</h3>
              </div>
              <button
                onClick={() => setShowSyncDialog(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 max-h-[350px] overflow-y-auto space-y-3 hide-scrollbar">
              {pendingTexts.length === 0 && pendingManual.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-6">لا توجد عمليات معلقة حالياً!</p>
              ) : (
                <>
                  {pendingTexts.map((item, idx) => (
                    <div key={`text-${idx}`} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 text-xs">
                      <div className="flex-1 min-w-0 pr-1 text-slate-700 dark:text-slate-300 text-right">
                        <p className="font-semibold truncate">"{item.text}"</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          تاريخ التسجيل: {new Date(item.timestamp).toLocaleTimeString("ar-EG")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteTextItem(idx)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition-colors shrink-0"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {pendingManual.map((item, idx) => (
                    <div key={`manual-${idx}`} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 text-xs">
                      <div className="flex-1 min-w-0 pr-1 text-slate-700 dark:text-slate-300 text-right">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.amount} ج.م - {item.category}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{item.description || "معاملة يدوية أوفلاين"}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteManualItem(idx)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition-colors shrink-0"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3">
              <Button
                onClick={handleManualSync}
                disabled={isRetrying || (pendingTexts.length === 0 && pendingManual.length === 0)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 gap-2 text-sm font-bold active-press"
              >
                <RefreshCw className={cn("w-4 h-4", isRetrying && "animate-spin")} />
                {isRetrying ? "جاري المزامنة..." : "مزامنة الآن"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSyncDialog(false)}
                className="rounded-xl border-slate-200 dark:border-slate-700 py-2 text-sm font-semibold"
              >
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
