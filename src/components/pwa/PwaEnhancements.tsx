import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalonePwa,
  triggerInstallPrompt,
} from "@/pwa/register-sw";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "smartspend_pwa_install_dismissed";

export function PwaEnhancements() {
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isStandalonePwa()) return;

    const sync = () => setCanInstall(!!getDeferredInstallPrompt());
    sync();
    window.addEventListener("pwa-install-available", sync);

    if (isIosSafari() && !dismissed) {
      setShowIosHint(true);
    }

    return () => window.removeEventListener("pwa-install-available", sync);
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    setShowIosHint(false);
    setCanInstall(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (isStandalonePwa() || dismissed) return null;
  if (!canInstall && !showIosHint) return null;

  return (
    <div
      className={cn(
        "lg:hidden fixed left-3 right-3 z-[45]",
        "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
      )}
      role="region"
      aria-label="تثبيت التطبيق"
    >
      {canInstall && (
        <div className="rounded-xl border border-emerald-200 bg-white dark:bg-slate-900 shadow-lg p-3 flex items-start gap-3">
          <Download className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">ثبّت SmartSpend على موبايلك</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              افتح من درج التطبيقات بسرعة — مثل التطبيق الأصلي.
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                className="min-h-[40px] flex-1"
                onClick={() => void triggerInstallPrompt().then((ok) => ok && dismiss())}
              >
                تثبيت
              </Button>
              <Button size="sm" variant="ghost" className="min-h-[40px]" onClick={dismiss}>
                لاحقاً
              </Button>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="tap-target p-1" aria-label="إغلاق">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {showIosHint && !canInstall && (
        <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 shadow-lg p-3 flex items-start gap-3">
          <Share className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">أضف إلى الشاشة الرئيسية (iOS)</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              من Safari: اضغط <strong>مشاركة</strong> ثم <strong>إضافة إلى الشاشة الرئيسية</strong>.
            </p>
            <Button size="sm" variant="outline" className="mt-2 min-h-[40px]" onClick={dismiss}>
              فهمت
            </Button>
          </div>
          <button type="button" onClick={dismiss} className="tap-target p-1" aria-label="إغلاق">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
